import { Inline, Stack } from 'aws-northstar'
import React from 'react'
import Dashboard from './Dashboard';
import HLSPlayer from './HLSPlayer'

const EnhancedDashboard = () => {
    return (
        <Stack spacing="xs">
            <HLSPlayer />
            <Dashboard />
        </Stack>
    )
}

export default EnhancedDashboard
