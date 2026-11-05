import type { Preview } from '@storybook/react-vite'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@tokens'
import '../design-system/base.css'
import '../src/styles.css'

const preview: Preview = {
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
    backgrounds: { options: { app: { name: 'Mnemo', value: 'var(--bg)' } } },
    controls: { matchers: { color: /(background|color)$/i } },
    a11y: { test: 'error' },
    options: {
      storySort: { order: ['Fundamentos', 'Primitivos', 'Compostos', 'Features', 'Telas'] },
    },
  },
  initialGlobals: { backgrounds: { value: 'app' } },
}

export default preview
