import { useJmailStore } from '../store.js';
import { InboxView } from '../views/inbox.js';
import { AccountsView, AdminView, OverviewView, ProfileView, UsersView } from '../views/dashboard.js';

const { computed, onBeforeUnmount, onMounted } = window.Vue;

const BootScreen = {
    template: `
    <section class="boot-screen">
        <div class="boot-card glass-panel">
            <div class="brand-mark brand-mark--boot">J</div>
            <p class="section-kicker">JMail</p>
            <h1>正在整理你的邮件宇宙</h1>
            <p>载入账户、邮箱、权限与统一收件箱。</p>
            <div class="boot-pulse"></div>
        </div>
    </section>
    `,
};

const AuthShell = {
    template: `
    <section class="auth-shell">
        <div class="auth-scene">
            <div class="auth-scene__copy">
                <p class="scene-kicker">Immersive Mail Console</p>
                <h1>不是网页，而是一座为多邮箱而生的沉浸式邮件工作台。</h1>
                <p>统一查看全部邮箱、单邮箱快速下钻、长文安静阅读、在手机上也能像原生邮件客户端一样顺手。</p>
            </div>
            <div class="scene-metrics">
                <article class="scene-card glass-panel" v-for="pillar in OVERVIEW_PILLARS" :key="pillar.title">
                    <p class="section-kicker">{{ pillar.title }}</p>
                    <h3>{{ pillar.copy }}</h3>
                </article>
            </div>
        </div>

        <div class="auth-panel glass-panel">
            <div class="auth-panel__head">
                <button type="button" class="brand-cluster brand-cluster--auth" @click="handleBrandGesture">
                    <div class="brand-mark">J</div>
                    <div>
                        <p class="section-kicker">JMail</p>
                        <h2>欢迎回来</h2>
                    </div>
                </button>
                <div class="mode-switch">
                    <button type="button" :class="{ 'is-active': state.authMode === 'login' }" @click="state.authMode = 'login'">登录</button>
                    <button type="button" :class="{ 'is-active': state.authMode === 'register' }" @click="state.authMode = 'register'">注册</button>
                    <button type="button" :class="{ 'is-active': state.authMode === 'reset' }" @click="state.authMode = 'reset'">重置密码</button>
                </div>
            </div>

            <form v-if="state.authMode === 'login'" class="auth-form" @submit.prevent="submitLogin">
                <div class="form-intro">
                    <p>输入邮箱地址或用户名，回到你的邮件控制台。</p>
                </div>
                <label class="field-label">
                    <span>邮箱地址或用户名</span>
                    <el-input v-model="state.authForms.login.username" placeholder="name@example.com / howiewu" />
                </label>
                <label class="field-label">
                    <span>密码</span>
                    <el-input v-model="state.authForms.login.password" type="password" show-password placeholder="输入密码" />
                </label>
                <div class="inline-check">
                    <el-checkbox v-model="state.authForms.login.remember_me">保持登录</el-checkbox>
                    <button type="button" class="text-button" @click="state.authMode = 'reset'">忘记密码</button>
                </div>
                <el-button class="auth-submit" type="primary" round native-type="submit" :loading="state.authSubmitting">登录</el-button>
            </form>

            <form v-else-if="state.authMode === 'register'" class="auth-form" @submit.prevent="submitRegister">
                <div class="form-intro">
                    <p>创建账户后即可接入自己的 IMAP / SMTP 邮箱。</p>
                </div>
                <label class="field-label">
                    <span>用户名</span>
                    <el-input v-model="state.authForms.register.username" placeholder="howiewu" />
                </label>
                <label class="field-label">
                    <span>邮箱</span>
                    <el-input v-model="state.authForms.register.email" placeholder="name@example.com" />
                </label>
                <label class="field-label">
                    <span>显示名称</span>
                    <el-input v-model="state.authForms.register.full_name" placeholder="选填" />
                </label>
                <div class="field-grid field-grid--compact">
                    <label class="field-label">
                        <span>密码</span>
                        <el-input v-model="state.authForms.register.password" type="password" show-password />
                    </label>
                    <label class="field-label">
                        <span>确认密码</span>
                        <el-input v-model="state.authForms.register.confirm_password" type="password" show-password />
                    </label>
                </div>
                <el-button class="auth-submit" type="primary" round native-type="submit" :loading="state.authSubmitting">注册并进入</el-button>
            </form>

            <form v-else class="auth-form" @submit.prevent="submitResetPassword">
                <div class="form-intro">
                    <p>输入邮箱、恢复码和新密码完成重置。</p>
                </div>
                <label class="field-label">
                    <span>邮箱</span>
                    <el-input v-model="state.authForms.reset.email" placeholder="name@example.com" />
                </label>
                <label class="field-label">
                    <span>恢复码</span>
                    <el-input v-model="state.authForms.reset.recovery_code" placeholder="8 位恢复码" />
                </label>
                <label class="field-label">
                    <span>新密码</span>
                    <el-input v-model="state.authForms.reset.new_password" type="password" show-password />
                </label>
                <el-button class="auth-submit" type="primary" round native-type="submit" :loading="state.authSubmitting">更新密码</el-button>
            </form>
        </div>
    </section>
    `,
    setup() {
        return { ...useJmailStore() };
    },
};

const WorkspaceShell = {
    components: {
        OverviewView,
        InboxView,
        AccountsView,
        AdminView,
        UsersView,
        ProfileView,
    },
    template: `
    <section class="workspace-shell">
        <button v-if="state.isMobile && state.mobileNavOpen" type="button" class="mobile-scrim" @click="state.mobileNavOpen = false"></button>

        <aside class="workspace-sidebar" :class="{ 'is-open': state.mobileNavOpen }">
            <div class="sidebar-head">
                <button type="button" class="brand-cluster brand-cluster--sidebar" @click="handleBrandGesture">
                    <div class="brand-mark">J</div>
                    <div>
                        <p class="section-kicker">{{ state.systemInfo?.app_name || 'JMail' }}</p>
                        <h2>{{ state.systemInfo?.app_version || 'Web Mail' }}</h2>
                    </div>
                </button>
                <button v-if="state.isMobile" type="button" class="sidebar-close" @click="state.mobileNavOpen = false">×</button>
            </div>

            <div class="nav-group">
                <p class="nav-group__title">工作区</p>
                <button
                    v-for="item in PRIMARY_NAV"
                    :key="item.key"
                    type="button"
                    class="nav-button"
                    :class="{ 'is-active': state.currentView === item.key }"
                    @click="openView(item.key)"
                >
                    <span>{{ item.short }}</span>
                    <strong>{{ item.label }}</strong>
                </button>
            </div>

            <div class="nav-group">
                <p class="nav-group__title">个人</p>
                <button
                    v-for="item in SECONDARY_NAV"
                    :key="item.key"
                    type="button"
                    class="nav-button"
                    :class="{ 'is-active': state.currentView === item.key }"
                    @click="openView(item.key)"
                >
                    <span>{{ item.short }}</span>
                    <strong>{{ item.label }}</strong>
                </button>
            </div>

            <div v-if="isAdmin" class="nav-group">
                <p class="nav-group__title">系统</p>
                <button
                    v-for="item in ADMIN_NAV"
                    :key="item.key"
                    type="button"
                    class="nav-button"
                    :class="{ 'is-active': state.currentView === item.key }"
                    @click="openView(item.key)"
                >
                    <span>{{ item.short }}</span>
                    <strong>{{ item.label }}</strong>
                </button>
            </div>

            <article class="sidebar-spotlight glass-subpanel">
                <p class="section-kicker">工作台状态</p>
                <h3>{{ userDisplayName }}</h3>
                <div class="spotlight-stats">
                    <div>
                        <span>未读</span>
                        <strong>{{ aggregateStats.unread || 0 }}</strong>
                    </div>
                    <div>
                        <span>邮箱</span>
                        <strong>{{ state.mailboxes.length }}</strong>
                    </div>
                </div>
                <div class="quota-bar quota-bar--compact">
                    <span :style="{ width: mailboxUsagePercent + '%' }"></span>
                </div>
                <p class="muted-copy">额度使用 {{ mailboxUsagePercent }}%，桌面和手机会共用同一组工作流状态。</p>
            </article>

            <div class="sidebar-footer">
                <button type="button" class="ghost-button" @click="refreshCurrentView()">刷新视图</button>
                <button type="button" class="ghost-button ghost-button--danger" @click="logout()">退出</button>
            </div>
        </aside>

        <div class="workspace-main">
            <header class="workspace-topbar glass-panel">
                <div class="workspace-topbar__lead">
                    <button v-if="state.isMobile" type="button" class="menu-button" @click="state.mobileNavOpen = true">≡</button>
                    <div>
                        <p class="section-kicker">{{ currentViewMeta.kicker }}</p>
                        <h1>{{ state.currentView === 'inbox' ? currentScopeLabel : currentViewMeta.title }}</h1>
                        <p>{{ state.currentView === 'inbox' ? currentScopeDescription : currentViewMeta.description }}</p>
                    </div>
                </div>
                <div class="workspace-topbar__actions">
                    <el-button round @click="refreshCurrentView()" :loading="state.refreshing">刷新</el-button>
                    <el-button type="primary" round @click="openCompose()">写邮件</el-button>
                    <button type="button" class="avatar-button" @click="openView('profile')">
                        <span>{{ userInitial }}</span>
                    </button>
                </div>
            </header>

            <div class="hero-strip">
                <article class="hero-chip" v-for="item in heroStats" :key="item.label">
                    <span>{{ item.label }}</span>
                    <strong>{{ item.value }}</strong>
                    <small>{{ item.hint }}</small>
                </article>
            </div>

            <main class="workspace-stage">
                <OverviewView v-if="state.currentView === 'overview'" />
                <InboxView v-else-if="state.currentView === 'inbox'" />
                <AccountsView v-else-if="state.currentView === 'accounts'" />
                <AdminView v-else-if="state.currentView === 'admin'" />
                <UsersView v-else-if="state.currentView === 'users'" />
                <ProfileView v-else />
            </main>
        </div>

        <button v-if="state.isMobile" type="button" class="floating-compose" @click="openCompose()">写</button>

        <nav v-if="state.isMobile" class="mobile-dock">
            <button
                v-for="item in MOBILE_DOCK"
                :key="item.key"
                type="button"
                class="mobile-dock__item"
                :class="{ 'is-active': state.currentView === item.key }"
                @click="openView(item.key)"
            >
                <span>{{ item.label }}</span>
            </button>
            <button type="button" class="mobile-dock__item" @click="state.mobileNavOpen = true">
                <span>更多</span>
            </button>
        </nav>
    </section>
    `,
    setup() {
        return { ...useJmailStore() };
    },
};

const OverlayDrawers = {
    template: `
    <div>
        <el-drawer
            v-model="state.composeOpen"
            :direction="state.isMobile ? 'btt' : 'rtl'"
            :size="state.isMobile ? '94%' : '560px'"
            class="utility-drawer"
            :title="state.composeMode === 'reply' ? '回复邮件' : '写邮件'"
        >
            <div class="drawer-form">
                <label class="field-label">
                    <span>发信邮箱</span>
                    <el-select v-model="state.composeForm.mailbox_id" placeholder="选择发信邮箱">
                        <el-option v-for="mailbox in state.mailboxes" :key="mailbox.id" :value="mailbox.id" :label="mailboxOptionLabel(mailbox)" />
                    </el-select>
                </label>
                <label class="field-label">
                    <span>收件人</span>
                    <el-input v-model="state.composeForm.to" placeholder="多个地址可用逗号分隔" />
                </label>
                <div class="field-grid field-grid--compact">
                    <label class="field-label">
                        <span>抄送</span>
                        <el-input v-model="state.composeForm.cc" placeholder="选填" />
                    </label>
                    <label class="field-label">
                        <span>密送</span>
                        <el-input v-model="state.composeForm.bcc" placeholder="选填" />
                    </label>
                </div>
                <label class="field-label">
                    <span>主题</span>
                    <el-input v-model="state.composeForm.subject" placeholder="输入主题" />
                </label>
                <label class="field-label">
                    <span>正文</span>
                    <el-input v-model="state.composeForm.body" type="textarea" :rows="state.isMobile ? 10 : 14" resize="vertical" placeholder="开始写邮件" />
                </label>
                <label class="field-label field-label--inline">
                    <span>作为 HTML 发送</span>
                    <el-switch v-model="state.composeForm.is_html" />
                </label>
                <div class="drawer-attachment-bar">
                    <input :ref="bindComposeFileInput" class="file-input" type="file" multiple @change="handleComposeFiles" />
                    <el-button round @click="triggerComposeFilePicker()">添加附件</el-button>
                </div>
                <div v-if="state.composeForm.attachments.length" class="attachment-strip">
                    <button type="button" class="attachment-chip attachment-chip--removable" v-for="attachment in state.composeForm.attachments" :key="attachment.id" @click="removeComposeAttachment(attachment.id)">
                        <strong>{{ attachment.filename }}</strong>
                        <span>{{ formatFileSize(attachment.size) }}</span>
                    </button>
                </div>
                <div class="drawer-actions">
                    <el-button round @click="state.composeOpen = false">取消</el-button>
                    <el-button type="primary" round :loading="state.composeSending" @click="submitCompose()">发送邮件</el-button>
                </div>
            </div>
        </el-drawer>

        <el-drawer
            v-model="state.mailboxDrawerOpen"
            :direction="state.isMobile ? 'btt' : 'rtl'"
            :size="state.isMobile ? '96%' : '680px'"
            class="utility-drawer"
            :title="state.mailboxFormMode === 'edit' ? '编辑邮箱' : '接入新邮箱'"
        >
            <div class="drawer-form drawer-form--wide">
                <div class="field-grid">
                    <label class="field-label">
                        <span>邮箱地址</span>
                        <el-input v-model="state.mailboxForm.email" placeholder="name@example.com" @input="handleMailboxEmailInput" />
                    </label>
                    <label class="field-label">
                        <span>显示名称</span>
                        <el-input v-model="state.mailboxForm.name" placeholder="如：工作邮箱" />
                    </label>
                </div>

                <label class="field-label">
                    <span>服务商模板</span>
                    <el-select v-model="state.mailboxForm.provider_template" filterable placeholder="自动识别或手动选择" @change="handleProviderTemplateChange()">
                        <el-option v-for="provider in state.providerCatalog" :key="provider.id" :value="provider.id" :label="provider.label" />
                    </el-select>
                </label>

                <article v-if="activeProvider" class="glass-subpanel provider-spotlight">
                    <div>
                        <p class="section-kicker">当前推荐</p>
                        <h3>{{ activeProvider.label }}</h3>
                        <p>{{ activeProvider.description }}</p>
                    </div>
                    <div class="action-row action-row--wrap">
                        <el-button round @click="applyCurrentProviderDefaults()">套用服务器配置</el-button>
                        <el-button v-if="activeProvider.oauth?.web_auth_available" type="primary" round @click="startProviderOAuth()">{{ activeProvider.oauth.label }}</el-button>
                    </div>
                    <p v-if="state.oauthStatus" class="muted-copy">{{ state.oauthStatus }}</p>
                </article>

                <label class="field-label field-label--inline">
                    <span>优先使用 OAuth</span>
                    <el-switch v-model="state.mailboxForm.use_oauth" />
                </label>

                <div class="field-grid">
                    <label class="field-label">
                        <span>IMAP 服务器</span>
                        <el-input v-model="state.mailboxForm.imap_server" />
                    </label>
                    <label class="field-label">
                        <span>IMAP 端口</span>
                        <el-input-number v-model="state.mailboxForm.imap_port" :min="1" :max="65535" />
                    </label>
                    <label class="field-label">
                        <span>IMAP 用户名</span>
                        <el-input v-model="state.mailboxForm.imap_username" />
                    </label>
                    <label class="field-label">
                        <span>IMAP 密码</span>
                        <el-input v-model="state.mailboxForm.imap_password" type="password" show-password :disabled="state.mailboxForm.use_oauth" placeholder="OAuth 邮箱可留空" />
                    </label>
                </div>

                <div class="field-grid">
                    <label class="field-label">
                        <span>SMTP 服务器</span>
                        <el-input v-model="state.mailboxForm.smtp_server" />
                    </label>
                    <label class="field-label">
                        <span>SMTP 端口</span>
                        <el-input-number v-model="state.mailboxForm.smtp_port" :min="1" :max="65535" />
                    </label>
                    <label class="field-label">
                        <span>SMTP 用户名</span>
                        <el-input v-model="state.mailboxForm.smtp_username" />
                    </label>
                    <label class="field-label">
                        <span>SMTP 密码</span>
                        <el-input v-model="state.mailboxForm.smtp_password" type="password" show-password :disabled="state.mailboxForm.use_oauth" placeholder="OAuth 邮箱可留空" />
                    </label>
                </div>

                <div class="field-grid field-grid--compact">
                    <label class="field-label field-label--inline">
                        <span>IMAP SSL</span>
                        <el-switch v-model="state.mailboxForm.imap_use_ssl" />
                    </label>
                    <label class="field-label field-label--inline">
                        <span>SMTP SSL</span>
                        <el-switch v-model="state.mailboxForm.smtp_use_ssl" />
                    </label>
                    <label class="field-label field-label--inline">
                        <span>SMTP TLS</span>
                        <el-switch v-model="state.mailboxForm.smtp_use_tls" />
                    </label>
                    <label class="field-label">
                        <span>同步间隔（秒）</span>
                        <el-input-number v-model="state.mailboxForm.fetch_interval" :min="60" :max="3600" :step="60" />
                    </label>
                </div>

                <div class="drawer-actions">
                    <el-button round @click="state.mailboxDrawerOpen = false">取消</el-button>
                    <el-button type="primary" round :loading="state.mailboxSaving" @click="submitMailboxForm()">{{ state.mailboxFormMode === 'edit' ? '保存配置' : '创建邮箱' }}</el-button>
                </div>
            </div>
        </el-drawer>

        <el-drawer
            v-model="state.createUserDrawerOpen"
            :direction="state.isMobile ? 'btt' : 'rtl'"
            :size="state.isMobile ? '88%' : '460px'"
            class="utility-drawer"
            title="创建用户"
        >
            <div class="drawer-form">
                <label class="field-label">
                    <span>用户名</span>
                    <el-input v-model="state.createUserForm.username" />
                </label>
                <label class="field-label">
                    <span>邮箱</span>
                    <el-input v-model="state.createUserForm.email" />
                </label>
                <label class="field-label">
                    <span>显示名称</span>
                    <el-input v-model="state.createUserForm.full_name" />
                </label>
                <label class="field-label">
                    <span>初始密码</span>
                    <el-input v-model="state.createUserForm.password" type="password" show-password />
                </label>
                <label class="field-label">
                    <span>邮箱上限</span>
                    <el-input-number v-model="state.createUserForm.max_mailboxes" :min="1" :max="50" />
                </label>
                <div class="drawer-actions">
                    <el-button round @click="state.createUserDrawerOpen = false">取消</el-button>
                    <el-button type="primary" round :loading="state.userCreating" @click="submitCreateUser()">创建用户</el-button>
                </div>
            </div>
        </el-drawer>

        <el-drawer
            v-if="state.isMobile"
            v-model="state.mobileDebugOpen"
            direction="btt"
            size="82%"
            class="utility-drawer utility-drawer--debug"
            title="开发者神域"
        >
            <div class="debug-grid">
                <article class="glass-subpanel">
                    <p class="section-kicker">运行态</p>
                    <div class="info-grid">
                        <div><span>当前视图</span><strong>{{ state.currentView }}</strong></div>
                        <div><span>邮箱范围</span><strong>{{ currentScopeLabel }}</strong></div>
                        <div><span>应用版本</span><strong>{{ state.systemInfo?.app_version || '未知' }}</strong></div>
                        <div><span>用户</span><strong>{{ state.user?.email || '匿名' }}</strong></div>
                    </div>
                </article>
                <article class="glass-subpanel">
                    <p class="section-kicker">快捷键</p>
                    <div class="shortcut-list">
                        <div class="shortcut-chip" v-for="shortcut in KEYBOARD_SHORTCUTS" :key="shortcut.key">
                            <strong>{{ shortcut.key }}</strong>
                            <span>{{ shortcut.label }}</span>
                        </div>
                    </div>
                </article>
                <el-button type="primary" round @click="copyDebugSnapshot()">复制状态快照</el-button>
            </div>
        </el-drawer>
    </div>
    `,
    setup() {
        return { ...useJmailStore() };
    },
};

export const JmailRoot = {
    components: {
        BootScreen,
        AuthShell,
        WorkspaceShell,
        OverlayDrawers,
    },
    template: `
    <div class="jmail-app">
        <div class="ambient ambient--one" aria-hidden="true"></div>
        <div class="ambient ambient--two" aria-hidden="true"></div>
        <div class="ambient ambient--three" aria-hidden="true"></div>
        <div class="ambient-grid" aria-hidden="true"></div>

        <BootScreen v-if="state.booting" />
        <AuthShell v-else-if="!state.token || !state.user" />
        <WorkspaceShell v-else />
        <OverlayDrawers />
    </div>
    `,
    setup() {
        const store = useJmailStore();
        onMounted(() => {
            void store.init();
        });
        onBeforeUnmount(() => {
            store.destroy();
        });
        return { ...store };
    },
};
