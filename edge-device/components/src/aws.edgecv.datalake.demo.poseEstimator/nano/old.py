from draw import drawKeypoints, drawSkeleton
import os
import sys
import cv2
from datetime import datetime
from timeit import default_timer
import numpy as np
import dlr
from dlr.counter.phone_home import PhoneHome

from posenet import decodeMultiplePoses
from stream_uploader import init_gg_stream_manager, send_to_gg_stream_manager


PhoneHome.disable_feature()

pose_model_path = os.environ["POSE_MODEL_PATH"]
s3_prefix = "pose-estimator-demo/processed-video-frames/nano/"

pose_input_tensor_name = 'sub_2'
pose_input_tensor_shape = [1, 257, 257, 3]
color_table = [(0,255,0), (255,0,0), (0,0,255), (255, 255, 0), (0, 255, 255), (255, 0, 255)]

print('Loading model...', flush=True)
try:
    model = dlr.DLRModel(pose_model_path, 'gpu', use_default_dlr=True)
except Exception as e:
    print(e, flush=True)


def gstreamer_pipeline(
    capture_width=1280,
    capture_height=720,
    inference_width=1280,
    inference_height=720,
    framerate=24,
    flip_method=0,
):
    return (
        "nvarguscamerasrc ! "
        "videoflip method=vertical-flip ! "
        "video/x-raw(memory:NVMM), "
        "width=(int)%d, height=(int)%d, "
        "format=(string)NV12, framerate=(fraction)%d/1 ! "
        "nvvidconv flip-method=%d ! "
        "video/x-raw, width=(int)%d, height=(int)%d, format=(string)BGRx ! "
        "videoconvert ! "
        "video/x-raw, format=(string)BGR ! appsink"
        % (
            capture_width,
            capture_height,
            framerate,
            flip_method,
            inference_width,
            inference_height,
        )
    )


def preprocess_image(img):
    resized_img = cv2.resize(img, (257, 257))
    recolored_img = cv2.cvtColor(resized_img, cv2.COLOR_BGR2RGB)
    raw_tensor = recolored_img.astype(float)
    normalized_tensor = raw_tensor * (2.0 / 255.0) - 1.0
    input_tensor = np.array(normalized_tensor, dtype=np.float32)
    reshaped_tensor = input_tensor.reshape(1, 257, 257, 3)
    return reshaped_tensor


def main():
    print('Entering main application...', flush=True)

    try:
        print('Initializing stream manager client...', flush=True)
        stream_mgr_client = init_gg_stream_manager()
        print('Completed stream manager initiation', flush=True)
    except:
        print('Error initializing stream manager client...', sys.exc_info()[0], flush=True)
        sys.exit(0)
    
    # To flip the image, modify the flip_method parameter (0 and 2 are the most common)
    gst_pipeline = gstreamer_pipeline(framerate=10, flip_method=0)
    print(gst_pipeline, flush=True)
    cap = cv2.VideoCapture(gst_pipeline, cv2.CAP_GSTREAMER)
    src_width = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
    src_height = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
    width_factor =  src_width/pose_input_tensor_shape[1]
    height_factor = src_height/pose_input_tensor_shape[2]   
    if cap.isOpened():
        while cap.isOpened():
            ret_val, img = cap.read()
            if ret_val:
                producer_timestamp = int(datetime.now().timestamp())
                start_time = default_timer()
                src_img = img
                # with CUDA
                # gpu_frame = cv2.cuda_GpuMat()
                # gpu_frame.upload(img)
                # rgb_frame = cv2.cuda_cvtColor(img, cv2.COLOR_BGR2GRAY)
                # without CUDA
                pose_input_tensor = preprocess_image(img)
                print("Transformed after " + str(default_timer() - start_time), flush=True)
                # print(pose_input_tensor.shape, flush=True)
                infer_start_time = default_timer()
                heatmaps, offsets, fwd_displacement, bwd_displacement = model.run({'sub_2': pose_input_tensor})
                print("Inference finished after " + str(default_timer() - infer_start_time), flush=True)
                postprocess_start_time = default_timer()
                # print(heatmaps.shape, flush=True)
                # print(offsets.shape, flush=True)
                # print(fwd_displacement.shape, flush=True)
                # print(bwd_displacement.shape, flush=True)
                poses = decodeMultiplePoses(heatmaps, offsets, \
                    fwd_displacement, bwd_displacement, \
                        width_factor, height_factor)
                pose_cnt = 0
                for idx in range(len(poses)):
                    if poses[idx]['score'] > 0.2:
                        color = color_table[idx]
                        drawKeypoints(poses[idx], src_img, color)
                        drawSkeleton(poses[idx], src_img)
                        print('Pose drawn', flush=True)
                        pose_cnt += 1
                print("Postprocessing finished after " + str(default_timer() - postprocess_start_time), flush=True)
                # if pose_cnt > 0:
                img_filename = 'nano-pose-output-' + str(producer_timestamp) + '.jpg'
                img_folder = '/tmp/pose-output'
                img_path = img_folder + '/' + img_filename
                cv2.imwrite(img_path, src_img) 
                # send_to_gg_stream_manager(stream_mgr_client, img_path, img_filename, s3_prefix)
    else:
        print("Unable to open camera", flush=True)


if __name__ == '__main__':
    main()
