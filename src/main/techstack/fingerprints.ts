export interface BundleFingerprint {
  name: string;
  category: string;
  patterns: string[];
  versionPattern?: string;
}

export interface CSSFingerprint {
  name: string;
  category: string;
  patterns: string[];
}

// JS/TS fingerprints — patterns that survive minification
// Selection criteria: API names, error messages, constants, comment identifiers
export const JS_FINGERPRINTS: BundleFingerprint[] = [
  // ── UI Frameworks ──
  { name: 'React', category: 'UI 框架', patterns: ['React.createElement', 'react.production.min.js', 'Invalid hook call', 'React.__SECRET_INTERNALS'] },
  { name: 'React DOM', category: 'UI 框架', patterns: ['react-dom.production.min.js', 'ReactDOM.render', 'react-dom'] },
  { name: 'Vue', category: 'UI 框架', patterns: ['__VUE__', 'VueJS is running', 'vue.runtime', 'createVNode'] },
  { name: 'Vue 3', category: 'UI 框架', patterns: ['createApp(', 'vue.esm-bundler', '__VUE_DEVTOOLS'] },
  { name: 'Angular', category: 'UI 框架', patterns: ['ng-version', 'angular-core', 'ɵɵdefineComponent', 'platformBrowserDynamic'] },
  { name: 'Svelte', category: 'UI 框架', patterns: ['svelte/internal', 'svelteJS', 'SvelteElement'] },
  { name: 'Solid.js', category: 'UI 框架', patterns: ['solid-js', 'createSignal', 'createEffect', 'createMemo'] },
  { name: 'Preact', category: 'UI 框架', patterns: ['preact/', 'preact.compat', 'preact/hooks'] },
  { name: 'Next.js', category: 'UI 框架', patterns: ['__NEXT_DATA__', '_next/', 'next/dist'] },
  { name: 'Nuxt', category: 'UI 框架', patterns: ['__NUXT__', 'nuxt/dist', 'useNuxtApp'] },
  { name: 'Remix', category: 'UI 框架', patterns: ['remix/', '@remix-run/'] },
  { name: 'Astro', category: 'UI 框架', patterns: ['astro-island', 'astro/', '_astro/'] },

  // ── UI Component Libraries ──
  { name: 'Material UI', category: 'UI 组件库', patterns: ['MUI:', '@mui/material', 'MuiButton', 'createTheme'] },
  { name: 'Ant Design', category: 'UI 组件库', patterns: ['ant.design', 'antd/', 'ant-btn-primary'] },
  { name: 'Chakra UI', category: 'UI 组件库', patterns: ['chakra-ui', 'chakra-', '@chakra-ui/'] },
  { name: 'Radix UI', category: 'UI 组件库', patterns: ['@radix-ui/', 'radix-ui', 'data-radix-'] },
  { name: 'shadcn/ui', category: 'UI 组件库', patterns: ['cn(', 'class-variance-authority', 'cva('] },
  { name: 'Headless UI', category: 'UI 组件库', patterns: ['@headlessui/', 'headlessui'] },
  { name: 'Mantine', category: 'UI 组件库', patterns: ['@mantine/', 'mantine-core'] },
  { name: 'Arco Design', category: 'UI 组件库', patterns: ['arco-design', '@arco-design/'] },
  { name: 'Semi Design', category: 'UI 组件库', patterns: ['@douyinfe/semi-', 'semi-icons'] },
  { name: 'TDesign', category: 'UI 组件库', patterns: ['tdesign-', '@tencent/tdesign'] },
  { name: 'Element Plus', category: 'UI 组件库', patterns: ['element-plus', 'el-button', 'ElMessage'] },
  { name: 'Vant', category: 'UI 组件库', patterns: ['vant/lib', 'van-button'] },
  { name: 'Vuetify', category: 'UI 组件库', patterns: ['vuetify/', 'v-btn', 'VApp'] },
  { name: 'Quasar', category: 'UI 组件库', patterns: ['quasar/', 'QBtn', 'Quasar'] },

  // ── State Management ──
  { name: 'Zustand', category: '状态管理', patterns: ['zustand', 'useStore(', 'createStore('] },
  { name: 'Redux', category: '状态管理', patterns: ['redux/', 'createStore', 'dispatch({type:', '@@redux/'] },
  { name: 'Redux Toolkit', category: '状态管理', patterns: ['@reduxjs/toolkit', 'createSlice', 'configureStore'] },
  { name: 'MobX', category: '状态管理', patterns: ['mobx', 'makeObservable', 'observable('] },
  { name: 'Recoil', category: '状态管理', patterns: ['recoil', 'useRecoilState', 'atom('] },
  { name: 'Jotai', category: '状态管理', patterns: ['jotai', 'useAtom(', 'atom('] },
  { name: 'Pinia', category: '状态管理', patterns: ['pinia', 'defineStore(', 'createPinia'] },
  { name: 'Vuex', category: '状态管理', patterns: ['vuex', 'createStore(', 'mapState'] },
  { name: 'TanStack Query', category: '状态管理', patterns: ['@tanstack/query', 'useQuery(', 'useMutation('] },
  { name: 'SWR', category: '状态管理', patterns: ['swr', 'useSWR('] },

  // ── Animation ──
  { name: 'Framer Motion', category: '动画库', patterns: ['framer-motion', 'MotionValue', 'useMotionValue', 'animate('] },
  { name: 'GSAP', category: '动画库', patterns: ['gsap/', 'gsap.to(', 'GreenSock', 'TweenMax'] },
  { name: 'Lottie', category: '动画库', patterns: ['lottie-', 'lottie-web', 'AnimationItem'] },
  { name: 'React Spring', category: '动画库', patterns: ['@react-spring/', 'useSpring(', 'useTransition('] },
  { name: 'Anime.js', category: '动画库', patterns: ['animejs', 'anime(', 'anime.js'] },
  { name: 'Three.js', category: '动画库', patterns: ['three/', 'THREE.WebGLRenderer', 'THREE.Scene'] },
  { name: 'D3.js', category: '动画库', patterns: ['d3-scale', 'd3-selection', 'd3-axis'] },

  // ── Routing ──
  { name: 'React Router', category: '路由', patterns: ['react-router', 'useNavigate(', 'useLocation(', 'BrowserRouter'] },
  { name: 'Vue Router', category: '路由', patterns: ['vue-router', 'createRouter(', 'useRoute('] },
  { name: 'TanStack Router', category: '路由', patterns: ['@tanstack/router', 'createRouter('] },

  // ── AI / LLM ──
  { name: 'OpenAI SDK', category: 'AI/LLM', patterns: ['openai/', 'OpenAI(', 'ChatCompletion'] },
  { name: 'Anthropic SDK', category: 'AI/LLM', patterns: ['@anthropic-ai/', 'Anthropic(', 'messages.create'] },
  { name: 'LangChain', category: 'AI/LLM', patterns: ['langchain', 'langchain/', 'LLMChain'] },
  { name: 'MCP SDK', category: 'AI/LLM', patterns: ['@modelcontextprotocol/', 'McpServer', 'McpClient'] },

  // ── HTTP ──
  { name: 'Axios', category: 'HTTP 客户端', patterns: ['axios', 'axios.create', 'interceptors'] },
  { name: 'Ky', category: 'HTTP 客户端', patterns: ['ky', 'ky.create', 'ky-default'] },
  { name: 'Got', category: 'HTTP 客户端', patterns: ['got/', 'got/dist'] },

  // ── Database ──
  { name: 'Prisma', category: '数据库', patterns: ['@prisma/', 'prisma-client', 'PrismaClient'] },
  { name: 'Drizzle ORM', category: '数据库', patterns: ['drizzle-orm', 'drizzle-kit'] },
  { name: 'TypeORM', category: '数据库', patterns: ['typeorm', 'createConnection', 'Entity('] },
  { name: 'Mongoose', category: '数据库', patterns: ['mongoose', 'mongoose.connect', 'Schema('] },
  { name: 'better-sqlite3', category: '数据库', patterns: ['better-sqlite3', 'Database('] },

  // ── Styling ──
  { name: 'Tailwind CSS', category: '样式方案', patterns: ['tailwindcss', 'tailwindcss/', 'tw-'] },
  { name: 'styled-components', category: '样式方案', patterns: ['styled-components', 'sc-', 'css('] },
  { name: 'Emotion', category: '样式方案', patterns: ['@emotion/', 'emotion/', 'css('] },
  { name: 'Stitches', category: '样式方案', patterns: ['@stitches/', 'styled(', 'css('] },
  { name: 'Panda CSS', category: '样式方案', patterns: ['@pandacss/', 'panda-', 'panda/css'] },

  // ── i18n ──
  { name: 'i18next', category: '国际化', patterns: ['i18next', 'useTranslation('] },
  { name: 'react-intl', category: '国际化', patterns: ['react-intl', 'formatMessage(', 'IntlProvider'] },
  { name: 'vue-i18n', category: '国际化', patterns: ['vue-i18n', 'useI18n('] },

  // ── Charts ──
  { name: 'ECharts', category: '图表可视化', patterns: ['echarts', 'echarts/', 'ECharts'] },
  { name: 'Chart.js', category: '图表可视化', patterns: ['chart.js', 'Chart(', 'ChartController'] },
  { name: 'Recharts', category: '图表可视化', patterns: ['recharts', 'ResponsiveContainer', 'LineChart'] },
  { name: 'D3.js', category: '图表可视化', patterns: ['d3-', 'd3.scale', 'd3.select'] },
  { name: 'AntV G2', category: '图表可视化', patterns: ['@antv/g2', 'antv/g2plot'] },

  // ── Utilities ──
  { name: 'Lodash', category: '工具库', patterns: ['lodash', '_.debounce', '_.throttle', '_.merge'] },
  { name: 'date-fns', category: '工具库', patterns: ['date-fns', 'formatDistance', 'parseISO'] },
  { name: 'Day.js', category: '工具库', patterns: ['dayjs', 'dayjs('] },
  { name: 'moment.js', category: '工具库', patterns: ['moment(', 'moment-timezone'] },
  { name: 'zod', category: '工具库', patterns: ['zod', 'z.object(', 'z.string('] },
  { name: 'yup', category: '工具库', patterns: ['yup', 'yup.object', 'yup.string'] },
  { name: 'uuid', category: '工具库', patterns: ['uuid', 'v4()', 'crypto.randomUUID'] },

  // ── Desktop / Electron ──
  { name: 'Electron', category: '桌面开发', patterns: ['electron/', 'electron.preload', 'ipcRenderer'] },
  { name: 'Electron Builder', category: '桌面开发', patterns: ['electron-builder', 'app-builder'] },
  { name: 'electron-updater', category: '桌面开发', patterns: ['electron-updater', 'autoUpdater'] },
  { name: 'Electron Store', category: '桌面开发', patterns: ['electron-store', 'Store('] },
  { name: 'Tauri API', category: '桌面开发', patterns: ['@tauri-apps/', '__TAURI__', 'invoke('] },
  { name: 'Wails', category: '桌面开发', patterns: ['wailsjs', 'wails/runtime'] },

  // ── Testing ──
  { name: 'Jest', category: '测试工具', patterns: ['jest/', 'describe(', 'expect('] },
  { name: 'Vitest', category: '测试工具', patterns: ['vitest', 'describe(', 'it('] },

  // ── Build Tools ──
  { name: 'Webpack', category: '构建工具', patterns: ['__webpack_require__', 'webpackJsonp', 'webpackBootstrap'] },
  { name: 'Vite', category: '构建工具', patterns: ['vite/modulepreload-polyfill', '__vite__', '/@vite/'] },
  { name: 'esbuild', category: '构建工具', patterns: ['esbuild', 'esbuild-'] },
  { name: 'Rollup', category: '构建工具', patterns: ['ROLLUP_ASSET_URL', 'ROLLUP_CHUNK_URL'] },
  { name: 'Turbopack', category: '构建工具', patterns: ['__turbopack_', 'turbopack'] },

  // ── WebSocket ──
  { name: 'Socket.IO', category: 'WebSocket', patterns: ['socket.io', 'socket.io-client'] },
  { name: 'ws', category: 'WebSocket', patterns: ['WebSocket(", "ws/lib'] },

  // ── File Handling ──
  { name: 'Sharp', category: '文件处理', patterns: ['sharp', 'sharp/lib'] },
  { name: 'pdf-lib', category: '文件处理', patterns: ['pdf-lib', 'PDFDocument'] },
  { name: 'JSZip', category: '文件处理', patterns: ['jszip', 'JSZip('] },

  // ── Auth ──
  { name: 'NextAuth', category: '认证授权', patterns: ['next-auth', 'NextAuth(', 'getSession'] },
  { name: 'Clerk', category: '认证授权', patterns: ['@clerk/', 'useUser(', 'useAuth('] },
  { name: 'better-auth', category: '认证授权', patterns: ['better-auth', 'createAuthClient'] },

  // ── Drag & Drop ──
  { name: 'dnd-kit', category: '拖放', patterns: ['@dnd-kit/', 'useDraggable', 'useDroppable'] },
  { name: 'react-beautiful-dnd', category: '拖放', patterns: ['react-beautiful-dnd', 'DragDropContext'] },

  // ── Collaboration ──
  { name: 'Yjs', category: '协作/CRDT', patterns: ['yjs', 'Y.Doc', 'Y.Array'] },
  { name: 'Automerge', category: '协作/CRDT', patterns: ['automerge', 'Automerge.'] },
  { name: 'Loro', category: '协作/CRDT', patterns: ['@loro-dev/', 'LoroDoc'] },

  // ── Misc ──
  { name: 'react-markdown', category: 'Markdown', patterns: ['react-markdown', 'Markdown('] },
  { name: 'remark', category: 'Markdown', patterns: ['remark', 'remark-gfm', 'remarkParse'] },
  { name: 'rehype', category: 'Markdown', patterns: ['rehype', 'rehype-highlight'] },
  { name: 'sonner', category: '通知', patterns: ['sonner', 'toast(', 'Toaster'] },
  { name: 'react-hot-toast', category: '通知', patterns: ['react-hot-toast', 'toast.success'] },
  { name: 'next-themes', category: '主题', patterns: ['next-themes', 'useTheme(', 'ThemeProvider'] },
  { name: 'class-variance-authority', category: '样式工具', patterns: ['class-variance-authority', 'cva('] },
  { name: 'clsx', category: '样式工具', patterns: ['clsx', 'clsx('] },
  { name: 'tailwind-merge', category: '样式工具', patterns: ['tailwind-merge', 'twMerge('] },
];

// CSS class prefix patterns — reliable UI library identifiers in stylesheets
export const CSS_FINGERPRINTS: CSSFingerprint[] = [
  { name: 'Material UI', category: 'UI 组件库', patterns: ['.MuiButton', '.MuiPaper', '.MuiTypography', '.MuiCard', '.MuiDialog', '.css-'] },
  { name: 'Ant Design', category: 'UI 组件库', patterns: ['.ant-btn', '.ant-card', '.ant-modal', '.ant-table', '.ant-input', '.ant-select'] },
  { name: 'Chakra UI', category: 'UI 组件库', patterns: ['.chakra-', 'chakra-ui'] },
  { name: 'Radix UI', category: 'UI 组件库', patterns: ['data-radix-', '.radix-'] },
  { name: 'Tailwind CSS', category: '样式方案', patterns: ['\\bg-\\[', 'text-\\[', 'flex gap-', 'rounded-', 'hover:bg-'] },
  { name: 'Bootstrap', category: 'UI 组件库', patterns: ['.btn-', '.container-fluid', '.row-cols-', '.navbar-', '.modal-content'] },
  { name: 'Element Plus', category: 'UI 组件库', patterns: ['.el-button', '.el-input', '.el-table', '.el-dialog'] },
  { name: 'Vant', category: 'UI 组件库', patterns: ['.van-button', '.van-cell', '.van-dialog'] },
  { name: 'Arco Design', category: 'UI 组件库', patterns: ['.arco-btn', '.arco-table', '.arco-modal'] },
  { name: 'Semi Design', category: 'UI 组件库', patterns: ['.semi-', 'semi-icon-'] },
  { name: 'TDesign', category: 'UI 组件库', patterns: ['.t-button', '.t-input', '.t-dialog'] },
  { name: 'MUI', category: 'UI 组件库', patterns: ['.mui-'] },
  { name: 'styled-components', category: '样式方案', patterns: ['.sc-', 'sc-h'] },
  { name: 'Emotion', category: '样式方案', patterns: ['css-', 'emotion-'] },
  { name: 'Vuetify', category: 'UI 组件库', patterns: ['.v-btn', '.v-card', '.v-dialog', '.v-application'] },
  { name: 'Quasar', category: 'UI 组件库', patterns: ['.q-btn', '.q-card', '.q-dialog'] },
];
