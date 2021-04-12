#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { InfrastructureStack } from '../lib/infrastructure-stack';

const app = new cdk.App();
new InfrastructureStack(app, "EdgeCVDatalakeStack", {
    env: {
        account: "<your_account_id>",
        region: "ap-northeast-1"
    }
});
