# Import packages
import os
import cv2
import sys
import numpy as np
from timeit import default_timer
from threading import Thread
from datetime import datetime
import uuid
import random
import dlr
from dlr.counter.phone_home import PhoneHome

from stream_uploader import init_gg_stream_manager, send_to_gg_stream_manager
from message_preparer import create_ipc_client, send_message


DEVICE_NAME = os.environ["DEVICE_NAME"]
IOT_CRED_ENDPOINT = os.environ["IOT_CRED_ENDPOINT"]
IOT_CERT_PATH = os.environ["IOT_CERT_PATH"]
IOT_KEY_PATH = os.environ["IOT_KEY_PATH"]
IOT_CA_PATH = os.environ["IOT_CA_PATH"]
KVS_ROLE_ALIAS = os.environ["KVS_ROLE_ALIAS"]
MODEL_PATH = os.environ["POSE_MODEL_PATH"]
INPUT_RESOLUTION = os.environ["INPUT_RESOLUTION"] ## DEFAULT TO 1280x720
S3_BUCKET_NAME = os.environ["STREAM_MANAGER_S3_BUCKET_NAME"]

s3_prefix = "pose-estimator-demo/processed-video-frames/nano/"

if INPUT_RESOLUTION == "":
    INPUT_RESOLUTION = "1280x720"

resW, resH = INPUT_RESOLUTION.split('x')
imW, imH = int(resW), int(resH)

# flag for debugging
debug = False

if not os.path.exists('/tmp/poseEstimator-output'):
    os.makedirs('/tmp/poseEstimator-output')

PhoneHome.disable_feature()

print('Loading model...', flush=True)
try:
    model = dlr.DLRModel(MODEL_PATH, 'gpu', use_default_dlr=True)
except Exception as e:
    print(e, flush=True)

height = 257
width = 257
# set stride to 32 based on model size
output_stride = 32

floating_model = True

input_mean = 127.5
input_std = 127.5

output_frame_rate = 8

kp_list = [
    "nose",
    "leftEye",
    "rightEye",
    "leftEar",
    "rightEar",
    "leftShoulder",
    "rightShoulder",
    "leftElbow",
    "rightElbow",
    "leftWrist",
    "rightWrist",
    "leftHip",
    "rightHip",
    "leftKnee",
    "rightKnee",
    "leftAnkle",
    "rightAnkle"
]

pose_list = [
    "none",
    "left_hand_raised",
    "right_hand_raised",
    "crouching",
]

locations = [
    "1f-corridor-1",
    "1f-corridor-2",
    "1f-frontgate-1",
]

def src_gstreamer_pipeline(
    capture_width=1280,
    capture_height=720,
    inference_width=640,
    inference_height=480,
    framerate=24,
    flip_method=0,
):
    return (
        "nvarguscamerasrc ! "
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


# def dst_gstreamer_pipeline(
#     output_width=640,
#     output_height=480,
#     framerate=24,
# ):
#     return (
#         'appsrc ! videoconvert ! '
#         'video/x-raw,format=I420,width=%d,height=%d,framerate=%d/1 ! '
#         'nvv4l2h264enc ! h264parse ! '
#         'video/x-h264,stream-format=avc,alignment=au,width=%d,height=%d,framerate=%d/1,profile=baseline ! '
#         f'kvssink stream-name={DEVICE_NAME} storage-size=512 iot-certificate="iot-certificate,endpoint={IOT_CRED_ENDPOINT},cert-path={IOT_CERT_PATH},key-path={IOT_KEY_PATH},ca-path={IOT_CA_PATH},role-aliases={KVS_ROLE_ALIAS}" aws-region=ap-northeast-1'
#         % (
#             output_width,
#             output_height,
#             framerate,
#             output_width,
#             output_height,
#             framerate,
#         )
#     )


def dst_gstreamer_pipeline(
    output_width=1280,
    output_height=720,
    framerate=24,
):
    return (
        'appsrc ! videoconvert ! '
        'video/x-raw,format=I420,width=%d,height=%d,framerate=%d/1 ! '
        'x264enc bframes=0 key-int-max=45 bitrate=1000 ! h264parse ! '
        'video/x-h264,stream-format=avc,alignment=au,width=%d,height=%d,framerate=%d/1,profile=baseline ! '
        f'kvssink stream-name={DEVICE_NAME} storage-size=512 iot-certificate="iot-certificate,endpoint={IOT_CRED_ENDPOINT},cert-path={IOT_CERT_PATH},key-path={IOT_KEY_PATH},ca-path={IOT_CA_PATH},role-aliases={KVS_ROLE_ALIAS}" aws-region=ap-northeast-1'
        % (
            output_width,
            output_height,
            framerate,
            output_width,
            output_height,
            framerate,
        )
    )


# Define VideoStream class to handle streaming of video from webcam in separate processing thread
# Source - Adrian Rosebrock, PyImageSearch: https://www.pyimagesearch.com/2015/12/28/increasing-raspberry-pi-fps-with-python-and-opencv/
class VideoStream:
    """Camera object that controls video streaming from the Picamera"""

    def __init__(self, resolution=(640, 480), framerate=30):
        # Initialize the PiCamera and the camera image stream
        # breakpoint()

        # src_pipeline = src_gstreamer_pipeline(
        #     resolution[0], resolution[1], flip_method=2)
        # print(src_pipeline, flush=True)
        # self.stream = cv2.VideoCapture(src_pipeline, cv2.CAP_GSTREAMER)

        self.stream = cv2.VideoCapture(0)
        if self.stream.isOpened() == True:
            print("Camera initiated.", flush=True)
        else:
            print("Error open camera", flush=True)
        ret = self.stream.set(cv2.CAP_PROP_FOURCC,
                              cv2.VideoWriter_fourcc(*'MJPG'))
        ret = self.stream.set(3, resolution[0])
        ret = self.stream.set(4, resolution[1])

        # Read first frame from the stream
        (self.grabbed, self.frame) = self.stream.read()

    # Variable to control when the camera is stopped
        self.stopped = False

    def start(self):
        # Start the thread that reads frames from the video stream
        Thread(target=self.update, args=()).start()
        return self

    def update(self):
        # Keep looping indefinitely until the thread is stopped
        while True:
            # If the camera is stopped, stop the thread
            if self.stopped:
                # Close camera resources
                self.stream.release()
                return

            # Otherwise, grab the next frame from the stream
            (self.grabbed, self.frame) = self.stream.read()

    def read(self):
        # Return the most recent frame
        return self.frame

    def stop(self):
        # Indicate that the camera and thread should be stopped
        self.stopped = True


def mod(a, b):
    """find a % b"""
    floored = np.floor_divide(a, b)
    return np.subtract(a, np.multiply(floored, b))


def argmax2d(inputs):
    """return y,x coordinates from heatmap"""
    # v1 is 9x9x17 heatmap
    v1 = inputs[0]
    height = v1.shape[0]
    width = v1.shape[1]
    depth = v1.shape[2]
    reshaped = np.reshape(v1, [height * width, depth])
    coords = np.argmax(reshaped, axis=0)
    yCoords = np.round(np.expand_dims(np.divide(coords, width), 1))
    xCoords = np.expand_dims(mod(coords, width), 1)
    return np.concatenate([yCoords, xCoords], 1)


def draw_kps(show_img,kps, ratio=None):
    for i in range(5,kps.shape[0]):
      if kps[i,2]:
        if isinstance(ratio, tuple):
          cv2.circle(show_img,(int(round(kps[i,1]*ratio[1])),int(round(kps[i,0]*ratio[0]))),2,(0,255,255),round(int(1*ratio[1])))
          continue
        cv2.circle(show_img,(kps[i,1],kps[i,0]),2,(0,255,255),-1)
    return show_img


def get_offset_point(y, x, offsets, keypoint, num_key_points):
    """get offset vector from coordinate"""
    y_off = offsets[y, x, keypoint]
    x_off = offsets[y, x, keypoint+num_key_points]
    return np.array([y_off, x_off])


def get_offsets(offsets_input, coords, num_key_points=17):
    """get offset vectors from all coordinates"""
    offsets = offsets_input[0]
    offset_vectors = np.array([]).reshape(-1, 2)
    for i in range(len(coords)):
        heatmap_y = int(coords[i][0])
        heatmap_x = int(coords[i][1])
        # make sure indices aren't out of range
        if heatmap_y > 8:
            heatmap_y = heatmap_y - 1
        if heatmap_x > 8:
            heatmap_x = heatmap_x - 1
        offset_vectors = np.vstack((offset_vectors, get_offset_point(
            heatmap_y, heatmap_x, offsets, i, num_key_points)))
    return offset_vectors


def draw_lines(keypoints, image):
    """connect important body part keypoints with lines"""
    #color = (255, 0, 0)
    color = (0, 255, 0)
    thickness = 2
    # refernce for keypoint indexing: https://www.tensorflow.org/lite/models/pose_estimation/overview
    body_map = [[5, 6], [5, 7], [7, 9], [5, 11], [6, 8], [8, 10],
                [6, 12], [11, 12], [11, 13], [13, 15], [12, 14], [14, 16]]
    for map_pair in body_map:
        #print(f'Map pair {map_pair}')
        start_pos = (int(keypoints[map_pair[0]][1]),
                     int(keypoints[map_pair[0]][0]))
        end_pos = (int(keypoints[map_pair[1]][1]),
                   int(keypoints[map_pair[1]][0]))
        image = cv2.line(image, start_pos, end_pos, color, thickness)
    return image


# print(input_details)
# print('--------------')
# print(output_details)

def main():

    try:
        videostream = VideoStream(resolution=(imW, imH), framerate=30).start()
        vidOut = cv2.VideoWriter(
            dst_gstreamer_pipeline(640, 480, output_frame_rate), cv2.CAP_GSTREAMER, 0, output_frame_rate, (640, 480), True)
        vidOut_status = vidOut.isOpened()
        print(vidOut_status)
        if vidOut_status != True:
            print("Cannot open Gstreamer pipeline for writing...", flush=True)

        try:
            print('Initializing stream manager client...', flush=True)
            stream_mgr_client = init_gg_stream_manager()
            print('Completed stream manager initiation', flush=True)
        except:
            print('Error initializing stream manager client...', sys.exc_info()[0], flush=True)
            sys.exit(0)
    
        mqtt_client = create_ipc_client()
        current_timestamp = 0

        while True:
            # Start timer (for calculating frame rate)
            start_time = default_timer()
            # t1 = cv2.getTickCount()

            # Grab frame from video stream
            frame1 = videostream.read()
            producer_timestamp = int(datetime.now().timestamp())

            # Acquire frame and resize to expected shape [1xHxWx3]
            frame = frame1.copy()
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            # rotated_frame = cv2.rotate(frame_rgb, cv2.ROTATE_180)
            frame_resized = cv2.resize(frame_rgb, (width, height))
            input_data = np.expand_dims(frame_resized, axis=0)

            frame_resized = cv2.cvtColor(frame_resized, cv2.COLOR_BGR2RGB)

            # Normalize pixel values if using a floating model (i.e. if model is non-quantized)
            if floating_model:
                input_data = (np.float32(input_data) - input_mean) / input_std

            infer_start_time = default_timer()
            heatmaps, offsets, fwd_displacement, bwd_displacement = model.run({'sub_2': input_data})
            # print("Inference finished after " + str(default_timer() - infer_start_time), flush=True)

            #OLD
            # get y,x positions from heatmap
            coords = argmax2d(heatmaps)
            # get offets from postions
            offset_vectors = get_offsets(offsets, coords)
            # use stide to get coordinates in image coordinates
            keypoint_positions = coords * output_stride + offset_vectors

            # print(keypoint_positions)

            pose_res = {}
            # Loop over all detections and draw detection box if confidence is above minimum threshold
            for i in range(len(keypoint_positions)):
                # Center coordinates
                x = int(keypoint_positions[i][1])
                y = int(keypoint_positions[i][0])
                center_coordinates = (x, y)
                radius = 2
                color = (0, 255, 0)
                thickness = 2
                cv2.circle(frame_resized, center_coordinates,
                        radius, color, thickness)
                pose_res[kp_list[i]] = str(x) + "," + str(y)
                if debug:
                    cv2.putText(frame_resized, str(
                        i), (x-4, y-4), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 1)  # Draw label text

            frame_resized = draw_lines(keypoint_positions, frame_resized)

            output_img = cv2.resize(frame_resized, (640, 480))

            vidOut.write(output_img)

            if producer_timestamp > current_timestamp:

                # save image with time stamp to directory
                img_filename = 'nano-pose-output-' + str(producer_timestamp) + '.jpg'
                img_folder = '/tmp/poseEstimator-output'
                img_path = img_folder + '/' + img_filename

                status = cv2.imwrite(img_path, output_img)

                s3key = s3_prefix + img_filename

                try:

                    event_msg = {
                        "msg_id": str(uuid.uuid4()),
                        "location": locations[random.randint(0,2)],
                        "timestamp": producer_timestamp,
                        "msg_type": "pose_event",
                        "s3uri": "s3://" + S3_BUCKET_NAME + "/" + s3key,
                        "person_count": int(random.randint(0,6)),
                        "action": pose_list[random.randint(0,3)],
                        "pose": pose_res
                    }

                    send_message(mqtt_client, event_msg)
                except Exception as e:
                    print('Cannot send message to IoT Core', flush=True)
                    print(e, flush=True)

            print("Frame written after " +
                str(default_timer() - start_time), flush=True)
            send_to_gg_stream_manager(stream_mgr_client, img_path, s3key)
            current_timestamp = producer_timestamp

            # Debug only

            # cv2.imshow('Hello', frame_resized)
            # cv2.waitKey(100)

    except KeyboardInterrupt:
        # Clean up
        cv2.destroyAllWindows()
        videostream.stop()
        print('Stopped video stream.')


if __name__ == '__main__':
    try:
        main()
    except:
        cv2.destroyAllWindows()
