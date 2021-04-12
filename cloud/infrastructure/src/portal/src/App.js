import { BrowserRouter as Router, Switch, Route } from "react-router-dom";
import NorthStarThemeProvider from "aws-northstar/components/NorthStarThemeProvider";
import Amplify, { Auth } from "aws-amplify";
import AppLayout from "./components/AppLayout";
import { AmplifyAuthenticator } from "@aws-amplify/ui-react";
import { useState, useEffect } from "react";
import { AuthState, onAuthUIStateChange } from "@aws-amplify/ui-components";
import EnhancedDashboard from './components/EnhancedDashboard';

const settings = window.portalSettings || {};

Amplify.configure({
  Auth: {
    identityPoolId: settings.identityPoolId,
    region: settings.region,
    userPoolId: settings.userPoolId,
    userPoolWebClientId: settings.userPoolWebClientId,
  },
  API: {
    endpoints: [
      {
        name: "portalBackendAPI",
        endpoint: settings.apiEndpoint
      }
    ]
  }
});

const withLayout = (Component) => (props) => (
  <AppLayout>
    <Component {...props} />
  </AppLayout>
);

const App = () => {
  const [authState, setAuthState] = useState();
  const [user, setUser] = useState();

  useEffect(() => {
    onAuthUIStateChange(async (nextAuthState, authData) => {
      setAuthState(nextAuthState);
      setUser(authData);
      // console.log(authData);
      const session = await Auth.currentSession();
      // console.log(session.getIdToken().getJwtToken());
    });
  }, []);

  return authState === AuthState.SignedIn && user ? (
    <NorthStarThemeProvider>
      <Router>
        <Switch>
          <Route exact path="/" component={withLayout(EnhancedDashboard)}></Route>
        </Switch>
      </Router>
    </NorthStarThemeProvider>
  ) : (
    <AmplifyAuthenticator />
  );
};

export default App;
