CREATE TABLE IF NOT EXISTS public.pose_data (
	msg_id VARCHAR(36),
    camera_location VARCHAR(20),
    msg_type VARCHAR(20),
    identified_action VARCHAR(40),
    event_time TIMESTAMP,
    event_time_qs VARCHAR(20),
    person_count SMALLINT,
    s3uri VARCHAR(150))
DISTKEY(camera_location)
SORTKEY(event_time_qs);