import { createFileRoute } from '@tanstack/react-router'
import { ArtifactsScreen } from '@/screens/artifacts/artifacts-screen'

export const Route = createFileRoute('/artifacts')({
  component: ArtifactsScreen,
})
