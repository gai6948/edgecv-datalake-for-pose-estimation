import sys
import json
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
     'processed_pose_data_table',
    'output_bucket',
    'processed_data_prefix',
    'glue_tmp_prefix'])

job.init(args['JOB_NAME'], args)

print("Database: {}".format(args['database_name']))
print("Raw Events Table: {}".format(args['raw_pose_data_table']))
print("Output bucket output path: {}{}".format(args['output_bucket'], args['processed_data_prefix']))
print("Glue Temp S3 location: {}{}".format(args['output_bucket'], args['glue_tmp_prefix']))

# catalog: database and table names
db_name = args['database_name']
raw_pose_data_table = args['raw_pose_data_table']
processed_pose_data_table = args['processed_pose_data_table']

# Output location
analytics_bucket_output = args['output_bucket'] + args['processed_data_prefix']
analytics_bucket_temp_storage = args['output_bucket'] + args['glue_tmp_prefix']

# Helper Function replaces the year month day and hour with the one from the timestamp
def applyTransform(rec):
  rec["year"] = datetime.utcfromtimestamp(rec["timestamp"]).year
  rec["month"] = datetime.utcfromtimestamp(rec["timestamp"]).month
  rec["day"] = datetime.utcfromtimestamp(rec["timestamp"]).day
  rec["hour"] = datetime.utcfromtimestamp(rec["timestamp"]).hour
  return rec

# Create dynamic frame from the source tables 
raw_pose_data = glueContext.create_dynamic_frame.from_catalog(
    database=db_name, 
    table_name=raw_pose_data_table,
    # transformation_ctx = "events"
)
print("---- Raw data schema: ----")
raw_pose_data.printSchema()

# Resolve choice type into struct
resolved_pose_data = raw_pose_data.resolveChoice(specs=[('pose','cast:struct')])

# Maps a transformation function over each record to re-build date partitions using the timestamp 
# rather than the Firehose ingestion timestamp
transformed_pose_data = Map.apply(frame = resolved_pose_data, f = applyTransform)

print("---- Processed data schema: ----")
transformed_pose_data.printSchema()
record_count = transformed_pose_data.count()
print("Processed record count: {}".format(record_count))

# Avoid errors if Glue Job Bookmark detects no new data to process and records = 0.
if record_count > 0:
    try:
        sink = glueContext.getSink(connection_type="s3", path=analytics_bucket_output,
                                enableUpdateCatalog=True, updateBehavior="UPDATE_IN_DATABASE",
                                partitionKeys=["year", "month", "day", "hour"],
                                transformation_ctx = "output")
        sink.setFormat("glueparquet")
        sink.setCatalogInfo(catalogDatabase=db_name, catalogTableName=processed_pose_data_table)
        sink.writeFrame(transformed_pose_data)
    except:
        print("There was an error writing out the results to S3")
    else:
        print("Partition saved.")
else:
    print("Glue Job Bookmark detected no new files to process")

job.commit()
