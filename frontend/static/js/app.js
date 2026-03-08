import { JmailRoot } from './components/layout.js';

const { createApp } = window.Vue;

createApp(JmailRoot)
    .use(window.ElementPlus, {
        locale: window.ElementPlusLocaleZhCn || undefined,
    })
    .mount('#app');
