import { useMemo } from "react";
import AppLayoutBase from "aws-northstar/layouts/AppLayout";
import HeaderBase from "aws-northstar/components/Header";
import SideNavigationBase, {
  SideNavigationItemType,
} from "aws-northstar/components/SideNavigation";
import { AmplifySignOut } from "@aws-amplify/ui-react";
import BreadcrumbGroup from "aws-northstar/components/BreadcrumbGroup";
import Container from "aws-northstar/layouts/Container";

const AppLayout = ({ children }) => {
  const Header = useMemo(
    () => (
    <Container>
      <HeaderBase title="Monitoring Portal" logoPath="/aws-logo.jpg" rightContent={<AmplifySignOut/>} />
    </Container>
    ),
    []
  );
  const Breadcrumbs = useMemo(() => <BreadcrumbGroup rootPath="Home" />, []);
  const SideNavigation = useMemo(() => {
    return (
      <SideNavigationBase
        header={{ text: "Menu", href: "/" }}
        items={[
          { text: "Home", type: SideNavigationItemType.LINK, href: "/" },
          {
            text: "View Camera",
            type: SideNavigationItemType.LINK,
            href: "/cameraview",
          },
        ]}
      ></SideNavigationBase>
    );
  }, []);

  return (
    <AppLayoutBase
      header={Header}
      navigation={SideNavigation}
      breadcrumbs={Breadcrumbs}
    >
      {children}
    </AppLayoutBase>
  );
};

export default AppLayout;
