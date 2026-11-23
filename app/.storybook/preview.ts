import type { Preview } from '@storybook/react-vite'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@tokens'
import '../src/styles.css'
import { installMock } from '../src/stories/mock/backend'
import { resetApp } from '../src/stories/mock/scenario'

installMock()

const preview: Preview = {
  beforeEach: () => resetApp(),
  parameters: {
    layout: 'padded',
    controls: { expanded: true },
    options: {
      storySort: {
        order: ['Tokens', ['Cores', 'Tipografia', 'Espaçamento', 'Raios', 'Elevação', 'Alturas'], 'Componentes', ['Base', 'Navegação', 'Painéis', 'Diff e Conflito', 'Revisão', 'Diálogos', 'Feedback'], 'Telas'],
      },
    },
  },
}

export default preview
