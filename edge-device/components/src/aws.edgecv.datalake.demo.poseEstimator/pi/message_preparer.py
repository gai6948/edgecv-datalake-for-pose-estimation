import json
import os
import sys

import awsiot.greengrasscoreipc
from awsiot.greengrasscoreipc.client import GreengrassCoreIPCClient
import awsiot.greengrasscoreipc.model as model

DEVICE_NAME = os.environ["DEVICE_NAME"]

def create_ipc_client():
    print('Creating Greengrass IPC client...', flush=True)
    try:
        ipc_client = awsiot.greengrasscoreipc.connect()
        print('Created Greengrass IPC client...', flush=True)
        return ipc_client
    except Exception:
        print('Cannot create IPC client...', flush=True)
        print(Exception, flush=True)
        # sys.exit(0)


def send_message(client: GreengrassCoreIPCClient, msg: dict):

    pub_ops = client.new_publish_to_iot_core()

    print(msg, flush=True)

    print('Created publish operation', flush=True)

    pub_ops.activate(model.PublishToIoTCoreRequest(
        topic_name=f"dt/camera/{DEVICE_NAME}/pose-estimator/result" ,
        qos=model.QOS.AT_LEAST_ONCE,
        payload=json.dumps(msg).encode()
    ))

    try:
        response = pub_ops.get_response().result(timeout=2.0)
        print('Successfully published message to IoT Core', flush=True)
    except Exception as e:
        print('Failed to publish message', flush=True)
