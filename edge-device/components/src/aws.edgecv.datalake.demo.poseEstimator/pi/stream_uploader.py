from stream_manager import StreamManagerClient
from stream_manager import StreamManagerException
from stream_manager import MessageStreamDefinition
from stream_manager import StrategyOnFull
from stream_manager import Persistence
from stream_manager import ExportDefinition
from stream_manager import S3ExportTaskExecutorConfig
from stream_manager import S3ExportTaskDefinition
from stream_manager import Util
from stream_manager import ReadMessagesOptions
from stream_manager import StatusMessage
from stream_manager import Status
from stream_manager import ResourceNotFoundException
from stream_manager import StatusConfig
from stream_manager import StatusLevel
import asyncio
import sys
import os

stream_name = "pose-estimator-pi-output"
status_stream_name = "pose-estimator-pi-output_status_stream"
s3_bucket_name = os.environ["STREAM_MANAGER_S3_BUCKET_NAME"]

def init_gg_stream_manager():
    print("Initializing Stream manager.....", flush=True)
    s3_stream_client = StreamManagerClient()
    try:
        s3_stream_client.delete_message_stream(stream_name=stream_name)
    except ResourceNotFoundException:
        pass
    try:
        s3_stream_client.delete_message_stream(stream_name=status_stream_name)
    except ResourceNotFoundException:
        pass

    try:
        # Create the Status Stream.
        s3_stream_client.create_message_stream(
            MessageStreamDefinition(name=status_stream_name, strategy_on_full=StrategyOnFull.OverwriteOldestData, persistence=Persistence.Memory)
        )
    except StreamManagerException:
        pass

    my_s3_export_definition = ExportDefinition(
        s3_task_executor=[
            S3ExportTaskExecutorConfig(
                identifier="s3_task_exe_" + stream_name,
                status_config=StatusConfig(
                    status_level=StatusLevel.TRACE,  # Default is INFO level statuses.
                    # Status Stream should be created before specifying in S3 Export Config.
                    status_stream_name=status_stream_name,
                ),
            )
        ]
    )

    try:
        s3_stream_client.create_message_stream(
            MessageStreamDefinition(
                name=stream_name,
                max_size=268435456, # Default is 256 MB.
                stream_segment_size=16777216, # Default is 16 MB.
                time_to_live_millis=None, # By default, no TTL is enabled.
                strategy_on_full=StrategyOnFull.OverwriteOldestData, # Required.
                persistence=Persistence.File, # Default is File.
                flush_on_write=False, # Default is false.
                export_definition=my_s3_export_definition
            )
        )
    except StreamManagerException:
        pass
    return s3_stream_client

def send_to_gg_stream_manager(s3_stream_client: StreamManagerClient, file_url: str, s3_key_name: str):
    print("In Send to GG Stream Manager Function", flush=True)
    #s3_key_name="processed_video_frames/"+file_prefix+"/"
    print("Input URL, bucket and key are ::::  {} - {} - {} ".format("file://"+file_url, s3_bucket_name, s3_key_name), flush=True)
    try:
        s3_export_task_definition = S3ExportTaskDefinition(input_url="file://"+file_url, bucket=s3_bucket_name, key=s3_key_name)
        print("Task definition created successfully....", flush=True)
        sequence_number = s3_stream_client.append_message(stream_name, Util.validate_and_serialize_to_json_bytes(s3_export_task_definition))
        print("Successfully appended to stream with sequence number {}".format(sequence_number), flush=True)
        is_upload_success = False
        while not is_upload_success:
            try:
                messages_list = s3_stream_client.read_messages(status_stream_name, ReadMessagesOptions(min_message_count=1, read_timeout_millis=10000))
                for message in messages_list:
                    # Deserialize the status message first.
                    status_message = Util.deserialize_json_bytes_to_obj(message.payload, StatusMessage)
                    if status_message.status == Status.Success:
                        print("Successfully uploaded file: {} to S3 bucket: {} and the location is: {}".format("file://"+file_url, s3_bucket_name, s3_key_name), flush=True)
                        is_upload_success = True
                    elif status_message.status == Status.Failure or status_message.status == Status.Canceled:
                        print("Unable to upload file:{} to S3 bucket:{}".format("file://"+file_url, s3_bucket_name), flush=True)
                        is_upload_success = True
            except StreamManagerException:
                print("Exception occurred while sending message to S3.. {} ", sys.exc_info()[0] , flush=True)
    except asyncio.TimeoutError:
        print("Timed out while executing.. {} ", sys.exc_info()[0] , flush=True)
    except Exception:
        print("Exception while running.. {} ", sys.exc_info()[0] , flush=True)
