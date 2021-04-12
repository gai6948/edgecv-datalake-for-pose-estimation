import React, { useState, useEffect } from "react";
import { Replay, PlayerConfiguration } from "vimond-replay";
import HlsjsVideoStreamer from "vimond-replay/video-streamer/hlsjs";
import "vimond-replay/index.css";
import Auth from "@aws-amplify/auth";
import KinesisVideo from "aws-sdk/clients/kinesisvideo";
import KinesisVideoArchMedia from "aws-sdk/clients/kinesisvideoarchivedmedia";
import AWS from "aws-sdk";
import { LoadingIndicator } from "aws-northstar";

const HLSPlayer = () => {
  const [player, setPlayer] = useState(null);
  const [playerConfig, setPlayerConfig] = useState({});
  const [kvs, setKvs] = useState(null);
  const [kvsArch, setKvsArch] = useState(null);
  const [hlsURL, setHlsURL] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => initialize(), []);
  // useEffect(() => getStreamingURL(), [kvs, kvsArch]);

  const streamName = "Raspberry-Pi-Demo";

  const initialize = async () => {
    const credentials = await Auth.currentCredentials();

    try {
      const awsOptions = {
        apiVersion: "latest",
        region: "ap-northeast-1",
        credentials,
      };
      const kvs = new KinesisVideo(awsOptions);
      const kvsArch = new KinesisVideoArchMedia(awsOptions);
      console.log(kvs);
      setKvs(kvs);
      setKvsArch(kvsArch);
      kvs.getDataEndpoint(
        {
          StreamName: streamName,
          APIName: "GET_HLS_STREAMING_SESSION_URL",
        },
        (err, res) => {
          if (err) {
            return console.error(err);
          }
          console.log("Data endpoint: " + res.DataEndpoint);
          kvsArch.endpoint = new AWS.Endpoint(res.DataEndpoint);
          kvsArch.getHLSStreamingSessionURL(
            {
              StreamName: streamName,
              PlaybackMode: "LIVE",
              Expires: 43200,
            },
            (err, res) => {
              if (err) {
                return console.error(err);
              }
              console.log("DASH Streaming URL: " + res.HLSStreamingSessionURL);
              setHlsURL(res.HLSStreamingSessionURL);

              // Set UI
              const playerConfigs = {
                responsivenessRules: [
                  {
                    className: "narrow",
                    width: {
                      max: 640,
                    },
                    height: {
                        max: 480
                    }
                  },
                ],
              };
              setPlayerConfig(playerConfigs);
              setLoading(false);
            }
          );
        }
      );
    } catch (error) {
      console.error("Cannot create KVS client");
      console.error(error);
    }
  };

  return (
    <div>
      {loading ? (
        <LoadingIndicator size="large" />
      ) : (
        <Replay source={hlsURL} options={playerConfig}>
          <HlsjsVideoStreamer />
        </Replay>
      )}
    </div>
  );
};

export default HLSPlayer;
