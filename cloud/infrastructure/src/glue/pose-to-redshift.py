import sys
from datetime import datetime
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from awsglue.context import GlueContext
from awsglue.dynamicframe import DynamicFrame
from awsglue.job import Job
from pyspark.sql.functions import *
from pyspark.context import SparkContext
from pyspark.sql import SparkSession
from pyspark.sql.types import StringType

#sc = SparkContext()
sc = SparkContext.getOrCreate()
sc.setLogLevel("INFO")
glueContext = GlueContext(sc)
job = Job(glueContext)

args = getResolvedOptions(sys.argv,
    ['JOB_NAME',
    'database_name',
     'raw_pose_data_table',
     'redshift_conn',
    'redshift_role'])

job.init(args['JOB_NAME'], args)

print("Database: {}".format(args['database_name']))
print("Raw Events Table: {}".format(args['raw_pose_data_table']))

# catalog: database and table names
db_name = args['database_name']
raw_pose_data_table = args['raw_pose_data_table']

# Output location
redshift_role = args['redshift_role']
redshift_conn = args['redshift_conn']

redshift_preaction_query = "CREATE TABLE IF NOT EXISTS public.pose_data (msg_id VARCHAR(36),camera_location VARCHAR(20),msg_type VARCHAR(20),identified_action VARCHAR(40),event_time TIMESTAMP,event_time_qs VARCHAR(20),person_count SMALLINT,s3uri VARCHAR(150));"

redshift_options = {
    "dbtable": "pose_data",
    "database": "default_db",
    "aws_iam_role": redshift_role,
    "preactions": redshift_preaction_query,
    "extracopyoptions": "COMPUPDATE ON"
}

# Helper Function replaces the timestamp into Redshift-compliant format
def applyTransform(rec):
  rec["event_time"] = datetime.utcfromtimestamp(rec["timestamp"]).strftime("%m %d, %Y %H:%M:%S")
  rec["event_time_qs"] = datetime.utcfromtimestamp(rec["timestamp"]).strftime("%Y-%m-%d %H:%M:%S")
  return rec

# Create dynamic frame from the source tables 
raw_pose_data = glueContext.create_dynamic_frame.from_catalog(
    database=db_name, 
    table_name=raw_pose_data_table,
    # transformation_ctx = "events"
)
print("---- Raw data schema: ----")
raw_pose_data.printSchema()

# Drop the pose field
pose_dropped = raw_pose_data.drop_fields(paths=["pose", "year", "month", "day", "hour"], transformation_ctx="drop_pose")

# Rename some fields to avoid Postgres reserved column name
loc_renamed_df = pose_dropped.rename_field("location", "camera_location", transformation_ctx="rename_location")
act_renamed_df = loc_renamed_df.rename_field("action", "identified_action", transformation_ctx="rename_action")

# Maps a transformation function over each record to change timestamp from epoch to redshift-compliant format
transformed_pose_data = Map.apply(frame = act_renamed_df, f = applyTransform)

final_pose_data = transformed_pose_data.drop_fields(paths=["timestamp"], transformation_ctx="drop_timestamp")

print("---- Processed data schema: ----")
final_pose_data.printSchema()
record_count = final_pose_data.count()
print("Processed record count: {}".format(record_count))

# Avoid errors if Glue Job Bookmark detects no new data to process and records = 0.
if record_count > 0:
    glueContext.write_dynamic_frame.from_jdbc_conf(
        frame=final_pose_data,
        catalog_connection=redshift_conn,
        connection_options=redshift_options,
        redshift_tmp_dir=args["TempDir"])
else:
    print("Glue Job Bookmark detected no new files to process")

job.commit()
