import { createFileRoute } from '@tanstack/react-router'
import { WidgetsScreen } from '@/screens/widgets/widgets-screen'

export const Route = createFileRoute('/widgets')({
  component: WidgetsScreen,
})
