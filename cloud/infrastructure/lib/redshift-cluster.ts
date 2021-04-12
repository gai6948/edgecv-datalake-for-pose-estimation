import * as cdk from "@aws-cdk/core";
import * as redshift from "@aws-cdk/aws-redshift";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as iam from "@aws-cdk/aws-iam";

export interface RedshiftClusterResourcesProps {}

export class RedshiftClusterResources extends cdk.Construct {
  public redshiftVPC: ec2.Vpc;
  public redshiftSubnet: ec2.ISubnet;
  public redshiftSG: ec2.SecurityGroup;
  public redshiftCluster: redshift.Cluster;
  public redshiftRole: iam.Role;

  constructor(
    scope: cdk.Construct,
    id: string,
    props: RedshiftClusterResourcesProps
  ) {
    super(scope, id);

    const vpc = new ec2.Vpc(this, "RedshiftVPC", {
      maxAzs: 2,
    });
    this.redshiftVPC = vpc;
    this.redshiftSubnet = vpc.selectSubnets({subnetType: ec2.SubnetType.PRIVATE}).subnets[0];
    this.redshiftSG = new ec2.SecurityGroup(this, "RedshiftSecGrp", {
      vpc,
      allowAllOutbound: true
    });
    this.redshiftSG.addIngressRule(this.redshiftSG, ec2.Port.allTcp(), "Allow same SG");
    this.redshiftSG.addIngressRule(ec2.Peer.ipv4("13.113.244.32/27"), ec2.Port.tcp(5439), "Allow Quicksight in ap-northeast-1 region to access Redshift")

    const redShiftS3Role = new iam.Role(this, "RedshiftS3Role", {
      assumedBy: new iam.ServicePrincipal("redshift.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3ReadOnlyAccess"),
      ],
    });
    this.redshiftRole = redShiftS3Role;
    redShiftS3Role.attachInlinePolicy(new iam.Policy(this, "GluePolicy", {
      document: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["glue:*"],
            resources: ["*"]
          })
        ]
      })
    }));

    const redshiftSubnetGrp = new redshift.ClusterSubnetGroup(this, "RedshiftSubnetGroup", {
      vpc,
      description: "Default subnet group",
      vpcSubnets: {
        onePerAz: true,
        subnetType: ec2.SubnetType.PRIVATE
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    const redshiftCluster = new redshift.Cluster(this, "PoseDataWarehouse", {
      masterUser: {
        masterUsername: "dev",
      },
      vpc,
      securityGroups: [this.redshiftSG],
      subnetGroup: redshiftSubnetGrp,
      nodeType: redshift.NodeType.RA3_4XLARGE,
      roles: [redShiftS3Role],
      publiclyAccessible: true,
      port: 5439,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    this.redshiftCluster = redshiftCluster;
  }
}
