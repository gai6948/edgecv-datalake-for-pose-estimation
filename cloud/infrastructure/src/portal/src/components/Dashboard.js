import React, { useEffect, useState } from "react";
import { Auth, API } from "aws-amplify";
import { embedDashboard } from "amazon-quicksight-embedding-sdk";
import { LoadingIndicator } from "aws-northstar";

const Dashboard = () => {
  const [loading, setLoading] = useState(true);

  useEffect(() => getQuickSightDashboardEmbedURL());

  const getQuickSightDashboardEmbedURL = async () => {
    const data = await Auth.currentSession();
    console.log(data);
    const jwtToken = data.idToken.jwtToken;
    const payloadSub = data.idToken.payload.sub;
    const email = data.idToken.payload.email;

    const params = {
      headers: {
        Authorization: `Bearer ${jwtToken}`
      },
      response: true,
      queryStringParameters: {
        jwtToken: jwtToken,
        payloadSub: payloadSub,
        email: email,
      },
    };

    const quicksight = await API.get(
      "portalBackendAPI",
      "/embed-dashboard-link",
      params
    );

    console.log(quicksight);
    const url = quicksight.data.EmbedUrl


    const containerDiv = document.getElementById("dashboardContainer");
    const options = {
      url,
      container: containerDiv,
      scrolling: "no",
      height: "640px",
      width: "800px",
      footerPaddingEnabled: true,
    };
    const dashboard = embedDashboard(options);
    setLoading(false);
  };

  return (
    <div>
      {loading && (
        <div className={loading}>
          <LoadingIndicator />
        </div>
      )}
      <div id="dashboardContainer"></div>
    </div>
  );
};

export default Dashboard;
