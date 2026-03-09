import { useJmailStore } from '../store.js';
import { InboxView, SearchView } from '../views/inbox.js';
import { AccountsView, AdminView, OverviewView, ProfileView, UsersView } from '../views/dashboard.js';

const { computed, nextTick, onBeforeUnmount, onMounted, ref } = window.Vue;

const BootScreen = {
    template: `
    <section class="boot-screen">
        <div class="boot-card glass-panel">
            <div class="brand-mark brand-mark--boot">J</div>
            <p class="section-kicker">JMail</p>
            <h1>{{ t('Preparing workspace') }}</h1>
            <p>{{ t('Accounts, mailboxes and system status are being synchronized.') }}</p>
            <div class="boot-pulse"></div>
        </div>
    </section>
    `,
    setup() {
        return { ...useJmailStore() };
    },
};

const AuthShell = {
    template: `
    <section class="auth-shell">
        <aside class="auth-side auth-side--intro">
            <div class="auth-side__hero glass-panel">
                <div class="brand-cluster brand-cluster--sidebar">
                    <div class="brand-mark">J</div>
                    <div>
                        <p class="section-kicker">JMail</p>
                        <h1>{{ t('Multi-mail workspace for business operations') }}</h1>
                    </div>
                </div>
                <p class="auth-side__intro">{{ t('The interface focuses on unified processing, account governance and stable onboarding. Decoration is reduced so operational data stays obvious.') }}</p>
                <div class="auth-side__list">
                    <article class="auth-side__item" v-for="pillar in OVERVIEW_PILLARS" :key="pillar.title">
                        <p class="section-kicker">{{ t(pillar.title) }}</p>
                        <h3>{{ t(pillar.copy) }}</h3>
                    </article>
                </div>
            </div>

            <div class="auth-side__metrics">
                <article class="auth-side__metric glass-subpanel">
                    <span>{{ t('Unified mail intake') }}</span>
                    <strong>{{ t('Mail Center') }}</strong>
                    <p>{{ t('Review overall load first, then move into a specific mailbox when necessary.') }}</p>
                </article>
                <article class="auth-side__metric glass-subpanel">
                    <span>{{ t('Standard onboarding') }}</span>
                    <strong>OAuth / IMAP</strong>
                    <p>{{ t('Support provider templates, enterprise mailboxes and custom connection settings.') }}</p>
                </article>
                <article class="auth-side__metric glass-subpanel">
                    <span>{{ t('Operational visibility') }}</span>
                    <strong>{{ t('Stats') }}</strong>
                    <p>{{ t('Unread load, sync alerts, quotas and rules stay visible at all times.') }}</p>
                </article>
            </div>
        </aside>

        <section class="auth-panel glass-panel">
            <div class="auth-panel__head">
                <div>
                    <p class="section-kicker">{{ t('Account Access') }}</p>
                    <h2>{{ state.authMode === 'register' ? t('Create account') : state.authMode === 'reset' ? t('Reset password') : t('Sign in to workspace') }}</h2>
                    <p class="muted-copy">{{ t('Sign in with email or username. Administrators can also create and manage additional accounts after initial deployment.') }}</p>
                </div>
                <div class="auth-panel__toolbar">
                    <div class="mode-switch">
                        <button type="button" :class="{ 'is-active': state.authMode === 'login' }" @click="state.authMode = 'login'">{{ t('Sign in') }}</button>
                        <button type="button" :class="{ 'is-active': state.authMode === 'register' }" @click="state.authMode = 'register'">{{ t('Register') }}</button>
                        <button type="button" :class="{ 'is-active': state.authMode === 'reset' }" @click="state.authMode = 'reset'">{{ t('Reset') }}</button>
                    </div>
                </div>
            </div>

            <form v-if="state.authMode === 'login'" class="auth-form" @submit.prevent="submitLogin">
                <div class="form-intro">
                    <p>{{ t('Enter account credentials to continue to the mail workspace.') }}</p>
                </div>
                <label class="field-label">
                    <span>{{ t('Email address or username') }}</span>
                    <el-input v-model="state.authForms.login.username" :placeholder="t('name@example.com / username')" />
                </label>
                <label class="field-label">
                    <span>{{ t('Password') }}</span>
                    <el-input v-model="state.authForms.login.password" type="password" show-password :placeholder="t('Enter password')" />
                </label>
                <div class="inline-check">
                    <el-checkbox v-model="state.authForms.login.remember_me">{{ t('Keep me signed in') }}</el-checkbox>
                    <button type="button" class="text-button" @click="state.authMode = 'reset'">{{ t('Forgot password') }}</button>
                </div>
                <el-button class="auth-submit" type="primary" native-type="submit" :loading="state.authSubmitting">{{ t('Sign in') }}</el-button>
            </form>

            <form v-else-if="state.authMode === 'register'" class="auth-form" @submit.prevent="submitRegister">
                <div class="form-intro">
                    <p>{{ t('Create an account before connecting IMAP or SMTP mailboxes.') }}</p>
                </div>
                <label class="field-label">
                    <span>{{ t('Username') }}</span>
                    <el-input v-model="state.authForms.register.username" :placeholder="t('Username')" />
                </label>
                <label class="field-label">
                    <span>{{ t('Email') }}</span>
                    <el-input v-model="state.authForms.register.email" :placeholder="t('name@example.com')" />
                </label>
                <label class="field-label">
                    <span>{{ t('Display name') }}</span>
                    <el-input v-model="state.authForms.register.full_name" :placeholder="t('Optional')" />
                </label>
                <div class="field-grid field-grid--compact">
                    <label class="field-label">
                        <span>{{ t('Password') }}</span>
                        <el-input v-model="state.authForms.register.password" type="password" show-password />
                    </label>
                    <label class="field-label">
                        <span>{{ t('Confirm password') }}</span>
                        <el-input v-model="state.authForms.register.confirm_password" type="password" show-password />
                    </label>
                </div>
                <el-button class="auth-submit" type="primary" native-type="submit" :loading="state.authSubmitting">{{ t('Create account') }}</el-button>
            </form>

            <form v-else class="auth-form" @submit.prevent="submitResetPassword">
                <div class="form-intro">
                    <p>{{ t('Use the recovery code to set a new password and return to the workspace.') }}</p>
                </div>
                <label class="field-label">
                    <span>{{ t('Email') }}</span>
                    <el-input v-model="state.authForms.reset.email" :placeholder="t('name@example.com')" />
                </label>
                <label class="field-label">
                    <span>{{ t('Recovery code') }}</span>
                    <el-input v-model="state.authForms.reset.recovery_code" :placeholder="t('8-digit recovery code')" />
                </label>
                <label class="field-label">
                    <span>{{ t('New password') }}</span>
                    <el-input v-model="state.authForms.reset.new_password" type="password" show-password />
                </label>
                <el-button class="auth-submit" type="primary" native-type="submit" :loading="state.authSubmitting">{{ t('Update password') }}</el-button>
            </form>
        </section>
    </section>
    `,
    setup() {
        return { ...useJmailStore() };
    },
};

const UtilityControls = {
    template: `
    <div class="global-utilitybar">
        <el-popover
            v-model:visible="state.localeMenuOpen"
            placement="bottom-end"
            :width="260"
            trigger="click"
            popper-class="global-toolbar-popover"
            @show="state.themeMenuOpen = false"
        >
            <template #reference>
                <button type="button" class="global-toolbar__trigger" :class="{ 'is-active': state.localeMenuOpen }" :aria-label="t('Language')">
                    <svg class="global-toolbar__icon global-toolbar__icon--locale" viewBox="0 0 24 24" aria-hidden="true">
                        <circle class="icon-orb" cx="12" cy="12" r="7.2"></circle>
                        <path class="icon-ring" d="M4.6 10.2c1.8-1.5 4.5-2.4 7.4-2.4 3.3 0 6.2 1.1 8.1 2.8"></path>
                        <path class="icon-ring" d="M5.4 14.1c1.6 1.2 4 1.9 6.6 1.9 3.6 0 6.7-1.2 8.5-3.1"></path>
                        <path class="icon-meridian" d="M12 4.8c2 2.1 3.1 4.7 3.1 7.2 0 3-1.4 5.7-3.1 7.2"></path>
                        <path class="icon-meridian" d="M12 4.8C10 6.9 8.9 9.5 8.9 12c0 3 1.4 5.7 3.1 7.2"></path>
                        <path class="icon-glyph" d="M9 8.2h3.2"></path>
                        <path class="icon-glyph" d="M7.9 11.1h5.6"></path>
                        <path class="icon-glyph" d="M10 13.9h4.7"></path>
                        <circle class="icon-dot" cx="15.9" cy="8.7" r="1.15"></circle>
                    </svg>
                </button>
            </template>
            <div class="global-toolbar-panel">
                <div class="global-toolbar-panel__head">
                    <p class="section-kicker">{{ t('Language') }}</p>
                    <h3>{{ activeLocaleLabel }}</h3>
                    <p>{{ t('Interface language') }}</p>
                </div>
                <div class="global-toolbar-panel__list">
                    <button
                        v-for="option in LOCALE_OPTIONS"
                        :key="option.value"
                        type="button"
                        class="global-toolbar-panel__option"
                        :class="{ 'is-active': state.locale === option.value }"
                        @click="applyLocale(option.value)"
                    >
                        <span>{{ option.label }}</span>
                        <span class="global-toolbar-panel__mark"></span>
                    </button>
                </div>
            </div>
        </el-popover>

        <el-popover
            v-model:visible="state.themeMenuOpen"
            placement="bottom-end"
            :width="260"
            trigger="click"
            popper-class="global-toolbar-popover"
            @show="state.localeMenuOpen = false"
        >
            <template #reference>
                <button
                    type="button"
                    class="global-toolbar__trigger global-toolbar__trigger--theme"
                    :class="{ 'is-active': state.themeMenuOpen }"
                    :data-resolved-theme="state.resolvedTheme"
                    :aria-label="t('Appearance')"
                >
                    <svg class="global-toolbar__icon global-toolbar__icon--theme" viewBox="0 0 24 24" aria-hidden="true">
                        <path class="icon-core" d="M12 4.4a6.4 6.4 0 1 0 0 12.8 5.4 5.4 0 1 1 0-12.8Z"></path>
                        <path class="icon-halo" d="M12 5.6a6.4 6.4 0 1 1-4.5 1.9"></path>
                        <path class="icon-ray" d="M12 2.4v2.3"></path>
                        <path class="icon-ray" d="M12 19.3v2.3"></path>
                        <path class="icon-ray" d="M21.6 12h-2.3"></path>
                        <path class="icon-ray" d="M4.7 12H2.4"></path>
                        <path class="icon-ray" d="m18.8 5.2-1.6 1.6"></path>
                        <path class="icon-ray" d="m6.8 17.2-1.6 1.6"></path>
                        <circle class="icon-spark" cx="16.9" cy="7.3" r="1"></circle>
                    </svg>
                </button>
            </template>
            <div class="global-toolbar-panel">
                <div class="global-toolbar-panel__head">
                    <p class="section-kicker">{{ t('Appearance') }}</p>
                    <h3>{{ activeThemeLabel }}</h3>
                    <p>{{ t('Adjust page brightness') }}</p>
                </div>
                <div class="global-toolbar-panel__list">
                    <button
                        v-for="option in THEME_OPTIONS"
                        :key="option.value"
                        type="button"
                        class="global-toolbar-panel__option"
                        :class="{ 'is-active': state.themeMode === option.value }"
                        @click="applyTheme(option.value)"
                    >
                        <span>{{ t(option.label) }}</span>
                        <span class="global-toolbar-panel__mark"></span>
                    </button>
                </div>
            </div>
        </el-popover>
    </div>
    `,
    setup() {
        const store = useJmailStore();
        const activeLocaleLabel = computed(() => store.LOCALE_OPTIONS.find((option) => option.value === store.state.locale)?.label || '中文');
        const activeThemeLabel = computed(() => store.t(store.THEME_OPTIONS.find((option) => option.value === store.state.themeMode)?.label || 'System'));

        const applyLocale = (locale) => {
            store.setLocale(locale);
            store.state.localeMenuOpen = false;
        };

        const applyTheme = (themeMode) => {
            store.setThemeMode(themeMode);
            store.state.themeMenuOpen = false;
        };

        return {
            ...store,
            activeLocaleLabel,
            activeThemeLabel,
            applyLocale,
            applyTheme,
        };
    },
};

const WorkspaceSearchControl = {
    template: `
    <div class="workspace-search-control">
        <div class="workspace-search-control__desktop" :class="{ 'is-open': searchOpen }">
            <div class="workspace-search-control__panel">
                <el-input
                    :ref="bindDesktopSearchInput"
                    v-model="state.emailQuery"
                    clearable
                    :placeholder="t('Search all mailboxes')"
                    @keyup.enter="submitSearch()"
                />
                <el-button type="primary" @click="submitSearch()">{{ t('Search') }}</el-button>
            </div>
            <button type="button" class="global-toolbar__trigger workspace-search-control__trigger" :class="{ 'is-active': searchOpen }" :aria-label="t('Global Search')" @click="toggleDesktopSearch()">
                <svg class="global-toolbar__icon global-toolbar__icon--search" viewBox="0 0 24 24" aria-hidden="true">
                    <circle class="icon-lens" cx="11" cy="11" r="5.8"></circle>
                    <path class="icon-handle" d="m15.4 15.4 4.3 4.3"></path>
                    <path class="icon-glint" d="M8.8 8.7c.6-.8 1.4-1.3 2.4-1.5"></path>
                </svg>
            </button>
        </div>

        <button v-if="state.isMobile" type="button" class="global-toolbar__trigger workspace-search-control__trigger workspace-search-control__trigger--mobile" :aria-label="t('Global Search')" @click="openMobileSearch()">
            <svg class="global-toolbar__icon global-toolbar__icon--search" viewBox="0 0 24 24" aria-hidden="true">
                <circle class="icon-lens" cx="11" cy="11" r="5.8"></circle>
                <path class="icon-handle" d="m15.4 15.4 4.3 4.3"></path>
                <path class="icon-glint" d="M8.8 8.7c.6-.8 1.4-1.3 2.4-1.5"></path>
            </svg>
        </button>

        <el-dialog v-model="mobileSearchOpen" :title="t('Global Search')" width="min(92vw, 420px)" center class="search-dialog" append-to-body>
            <div class="search-dialog__body">
                <el-input
                    :ref="bindMobileSearchInput"
                    v-model="state.emailQuery"
                    clearable
                    :placeholder="t('Search all mailboxes')"
                    @keyup.enter="submitMobileSearch()"
                />
            </div>
            <template #footer>
                <div class="search-dialog__footer">
                    <el-button @click="mobileSearchOpen = false">{{ t('Close') }}</el-button>
                    <el-button type="primary" @click="submitMobileSearch()">{{ t('Search') }}</el-button>
                </div>
            </template>
        </el-dialog>
    </div>
    `,
    setup() {
        const store = useJmailStore();
        const searchOpen = ref(false);
        const mobileSearchOpen = ref(false);
        const desktopSearchInput = ref(null);
        const mobileSearchInput = ref(null);

        const focusInput = async (inputRef) => {
            await nextTick();
            const instance = inputRef.value;
            if (typeof instance?.focus === 'function') {
                instance.focus();
                return;
            }
            const element = instance?.$el?.querySelector?.('input');
            if (element) {
                element.focus();
            }
        };

        const toggleDesktopSearch = async () => {
            searchOpen.value = !searchOpen.value;
            if (searchOpen.value) {
                await focusInput(desktopSearchInput);
            }
        };

        const submitSearch = async () => {
            await store.openGlobalSearch();
            searchOpen.value = false;
        };

        const openMobileSearch = async () => {
            mobileSearchOpen.value = true;
            await focusInput(mobileSearchInput);
        };

        const submitMobileSearch = async () => {
            await store.openGlobalSearch();
            mobileSearchOpen.value = false;
        };

        return {
            ...store,
            searchOpen,
            mobileSearchOpen,
            bindDesktopSearchInput: (element) => {
                desktopSearchInput.value = element;
            },
            bindMobileSearchInput: (element) => {
                mobileSearchInput.value = element;
            },
            toggleDesktopSearch,
            submitSearch,
            openMobileSearch,
            submitMobileSearch,
        };
    },
};

const WorkspaceShell = {
    components: {
        OverviewView,
        InboxView,
        SearchView,
        AccountsView,
        AdminView,
        UsersView,
        ProfileView,
        WorkspaceSearchControl,
        UtilityControls,
    },
    template: `
    <section class="workspace-shell">
        <button v-if="state.isMobile && state.mobileNavOpen" type="button" class="mobile-scrim" @click="state.mobileNavOpen = false"></button>

        <aside class="workspace-sidebar" :class="{ 'is-open': state.mobileNavOpen }">
            <div class="sidebar-head sidebar-head--stacked">
                <div class="sidebar-brand-card">
                    <div class="sidebar-brand-card__surface">
                        <div class="sidebar-brand-card__hero">
                            <div class="sidebar-brand-logo-wrap">
                                <img class="sidebar-brand-logo" src="/logo/jmail.png" alt="JMail logo">
                            </div>
                            <div class="sidebar-brand-card__copy">
                                <div class="sidebar-brand-card__titleline">
                                        <p class="section-kicker">JMAIL</p>
                                    <span class="sidebar-brand-card__version">v{{ state.systemInfo?.app_version || '1.0.0' }}</span>
                                </div>
                                <h2>{{ state.systemInfo?.app_name || 'JMail' }}</h2>
                                <p class="sidebar-brand-card__tagline">{{ t('Mail workspace') }}</p>
                            </div>
                        </div>

                        <div class="sidebar-brand-card__meta">
                            <span>{{ userRoleLabel(state.user?.role) }}</span>
                            <span class="sidebar-brand-card__meta-dot"></span>
                            <span>{{ t('Online') }}</span>
                        </div>
                    </div>
                </div>
                <div v-if="state.isMobile" class="sidebar-head__actions">
                    <button v-if="state.isMobile" type="button" class="sidebar-close" @click="state.mobileNavOpen = false">{{ t('Close') }}</button>
                </div>
            </div>

            <div class="sidebar-body">
                <div class="nav-group nav-group--compact">
                    <p class="nav-group__title">{{ t('Core') }}</p>
                    <button v-for="item in PRIMARY_NAV" :key="item.key" type="button" class="nav-button nav-button--compact" :class="{ 'is-active': state.currentView === item.key }" @click="openView(item.key)">
                        <span class="nav-button__marker"></span>
                        <div class="nav-button__meta">
                            <strong>{{ t(item.label) }}</strong>
                        </div>
                    </button>
                </div>
            </div>

            <div class="sidebar-footer">
                <el-popover v-model:visible="state.userMenuOpen" placement="top-start" :width="320" trigger="click" popper-class="sidebar-user-popover">
                    <template #reference>
                        <button type="button" class="sidebar-userdock">
                            <span class="sidebar-userdock__avatar">{{ userInitial }}</span>
                            <span class="sidebar-userdock__copy">
                                <strong>{{ userDisplayName }}</strong>
                                <small>{{ state.user?.email || t('Not signed in') }}</small>
                            </span>
                            <span class="sidebar-userdock__toggle"></span>
                        </button>
                    </template>
                    <div class="sidebar-userpanel">
                        <div class="sidebar-userpanel__head">
                            <div>
                                <p class="section-kicker">{{ t('Current User') }}</p>
                                <h3>{{ userDisplayName }}</h3>
                                <p class="muted-copy">{{ state.user?.email || t('Not signed in') }}</p>
                            </div>
                            <span class="status-pill" data-tone="info">{{ userRoleLabel(state.user?.role) }}</span>
                        </div>
                        <div class="sidebar-userpanel__stats">
                            <div>
                                <span>{{ t('Unread') }}</span>
                                <strong>{{ aggregateStats.unread || 0 }}</strong>
                            </div>
                            <div>
                                <span>{{ t('Mailboxes') }}</span>
                                <strong>{{ state.mailboxes.length }}</strong>
                            </div>
                        </div>
                        <article class="sidebar-userpanel__quota">
                            <div class="sidebar-panel__head">
                                <div>
                                    <p class="section-kicker">{{ t('Capacity') }}</p>
                                    <h3>{{ state.mailboxes.length }} / {{ state.user?.max_mailboxes || 0 }}</h3>
                                </div>
                                <span class="status-pill" data-tone="info">{{ t('Quota') }}</span>
                            </div>
                            <div class="quota-bar quota-bar--compact">
                                <span :style="{ width: mailboxUsagePercent + '%' }"></span>
                            </div>
                            <p class="muted-copy">{{ t('Mailbox quota usage is currently {percent}%.', { percent: mailboxUsagePercent }) }}</p>
                        </article>
                        <div class="sidebar-userpanel__menu">
                            <div class="sidebar-menu-section">
                                <p class="nav-group__title">{{ t('Personal') }}</p>
                                <button v-for="item in SECONDARY_NAV" :key="item.key" type="button" class="sidebar-panel-link" :class="{ 'is-active': state.currentView === item.key }" @click="openView(item.key)">
                                    <span>{{ t(item.label) }}</span>
                                    <strong>{{ t('Open') }}</strong>
                                </button>
                            </div>
                            <div v-if="isAdmin" class="sidebar-menu-section">
                                <p class="nav-group__title">{{ t('Administration') }}</p>
                                <button v-for="item in ADMIN_NAV" :key="item.key" type="button" class="sidebar-panel-link" :class="{ 'is-active': state.currentView === item.key }" @click="openView(item.key)">
                                    <span>{{ t(item.label) }}</span>
                                    <strong>{{ t('Open') }}</strong>
                                </button>
                            </div>
                        </div>
                        <div class="sidebar-userpanel__actions">
                            <el-button @click="refreshCurrentView()" :loading="state.refreshing">{{ t('Refresh') }}</el-button>
                            <el-button type="danger" plain @click="logout()">{{ t('Sign out') }}</el-button>
                        </div>
                    </div>
                </el-popover>
            </div>
        </aside>

        <div class="workspace-column">
            <div class="workspace-utilitybar">
                <WorkspaceSearchControl />
                <UtilityControls />
            </div>

            <div class="workspace-main">
                <header class="workspace-topbar workspace-topbar--studio">
                    <div class="workspace-topbar__lead">
                        <button v-if="state.isMobile" type="button" class="menu-button" @click="state.mobileNavOpen = true">{{ t('Menu') }}</button>
                        <div class="workspace-topbar__copy">
                            <span class="workspace-topbar__badge">{{ t(currentViewMeta.kicker) }}</span>
                            <h1>{{ state.currentView === 'inbox' ? currentScopeLabel : t(currentViewMeta.title) }}</h1>
                            <p>{{ state.currentView === 'inbox' ? currentScopeDescription : t(currentViewMeta.description) }}</p>
                        </div>
                    </div>
                    <div class="workspace-topbar__side">
                        <div v-if="!state.isMobile" class="workspace-topbar__capsules">
                            <span class="workspace-topbar__capsule">{{ t('Unread') }} {{ aggregateStats.unread || 0 }}</span>
                            <span class="workspace-topbar__capsule">{{ t('Mailboxes') }} {{ state.mailboxes.length }}</span>
                            <span class="workspace-topbar__capsule">{{ t('Rules') }} {{ activeRuleCount || 0 }}</span>
                        </div>
                        <div class="workspace-topbar__actions">
                            <el-button @click="refreshCurrentView()" :loading="state.refreshing">{{ t('Refresh') }}</el-button>
                            <el-button
                                v-if="state.currentView === 'overview'"
                                type="primary"
                                @click="startMailboxOnboarding()"
                            >
                                {{ t('Connect mailbox') }}
                            </el-button>
                            <el-button
                                v-else-if="state.currentView === 'accounts'"
                                type="primary"
                                @click="startMailboxOnboarding()"
                            >
                                {{ t('Add Mailbox') }}
                            </el-button>
                            <el-button
                                v-else-if="isAdmin && state.currentView === 'users'"
                                type="primary"
                                @click="openCreateUserDrawer()"
                            >
                                {{ t('Create User') }}
                            </el-button>
                            <el-button
                                v-else-if="isAdmin && state.currentView === 'admin'"
                                type="primary"
                                @click="openView('users')"
                            >
                                {{ t('Users & Access') }}
                            </el-button>
                            <el-button v-else-if="state.currentView === 'inbox'" type="primary" @click="openCompose()">{{ t('Compose') }}</el-button>
                        </div>
                    </div>
                </header>

                <main class="workspace-stage workspace-stage--flat">
                    <OverviewView v-if="state.currentView === 'overview'" />
                    <InboxView v-else-if="state.currentView === 'inbox'" />
                    <SearchView v-else-if="state.currentView === 'search'" />
                    <AccountsView v-else-if="state.currentView === 'accounts'" />
                    <AdminView v-else-if="state.currentView === 'admin'" />
                    <UsersView v-else-if="state.currentView === 'users'" />
                    <ProfileView v-else />
                </main>
            </div>
        </div>

        <button v-if="state.isMobile" type="button" class="floating-compose" @click="openCompose()">{{ t('New') }}</button>

        <nav v-if="state.isMobile" class="mobile-dock">
            <button v-for="item in MOBILE_DOCK" :key="item.key" type="button" class="mobile-dock__item" :class="{ 'is-active': state.currentView === item.key }" @click="openView(item.key)">
                <span>{{ t(item.label) }}</span>
            </button>
            <button type="button" class="mobile-dock__item" @click="state.mobileNavOpen = true">
                <span>{{ t('More') }}</span>
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
            :title="t(state.composeMode === 'reply' ? 'Reply Email' : 'Compose Email')"
        >
            <div class="drawer-form drawer-form--compose">
                <section class="drawer-section drawer-section--compact">
                    <div class="drawer-section__head">
                        <div>
                            <p class="section-kicker">{{ t('Message') }}</p>
                            <h3>{{ t(state.composeMode === 'reply' ? 'Reply draft' : 'New message') }}</h3>
                        </div>
                        <div class="drawer-summary">
                            <div class="drawer-summary__item">
                                <span>{{ t('Mailboxes') }}</span>
                                <strong>{{ state.mailboxes.length }}</strong>
                            </div>
                            <div class="drawer-summary__item">
                                <span>{{ t('Attachments') }}</span>
                                <strong>{{ state.composeForm.attachments.length }}</strong>
                            </div>
                        </div>
                    </div>
                    <label class="field-label">
                        <span>{{ t('From mailbox') }}</span>
                        <el-select v-model="state.composeForm.mailbox_id" :placeholder="t('Select mailbox')">
                            <el-option v-for="mailbox in state.mailboxes" :key="mailbox.id" :value="mailbox.id" :label="mailboxOptionLabel(mailbox)" />
                        </el-select>
                    </label>
                    <label class="field-label">
                        <span>{{ t('To') }}</span>
                        <el-input v-model="state.composeForm.to" :placeholder="t('Separate multiple addresses with commas')" />
                    </label>
                    <div class="field-grid field-grid--compact">
                        <label class="field-label">
                            <span>{{ t('CC') }}</span>
                            <el-input v-model="state.composeForm.cc" :placeholder="t('Optional')" />
                        </label>
                        <label class="field-label">
                            <span>{{ t('BCC') }}</span>
                            <el-input v-model="state.composeForm.bcc" :placeholder="t('Optional')" />
                        </label>
                    </div>
                    <label class="field-label">
                        <span>{{ t('Subject') }}</span>
                        <el-input v-model="state.composeForm.subject" :placeholder="t('Enter message subject')" />
                    </label>
                </section>

                <section class="drawer-section">
                    <div class="drawer-section__head">
                        <div>
                            <p class="section-kicker">{{ t('Body') }}</p>
                            <h3>{{ t('Content editor') }}</h3>
                        </div>
                        <label class="field-label field-label--inline">
                            <span>{{ t('Send as HTML') }}</span>
                            <el-switch v-model="state.composeForm.is_html" />
                        </label>
                    </div>
                    <label class="field-label">
                        <span>{{ t('Message') }}</span>
                        <el-input v-model="state.composeForm.body" type="textarea" :rows="state.isMobile ? 10 : 14" resize="vertical" :placeholder="t('Start writing')" />
                    </label>
                </section>

                <section class="drawer-section">
                    <div class="drawer-section__head">
                        <div>
                            <p class="section-kicker">{{ t('Attachments') }}</p>
                            <h3>{{ t('Supporting files') }}</h3>
                        </div>
                        <el-button @click="triggerComposeFilePicker()">{{ t('Add attachment') }}</el-button>
                    </div>
                    <input :ref="bindComposeFileInput" class="file-input" type="file" multiple @change="handleComposeFiles" />
                    <div v-if="state.composeForm.attachments.length" class="attachment-strip">
                        <button type="button" class="attachment-chip attachment-chip--removable" v-for="attachment in state.composeForm.attachments" :key="attachment.id" @click="removeComposeAttachment(attachment.id)">
                            <strong>{{ attachment.filename }}</strong>
                            <span>{{ formatFileSize(attachment.size) }}</span>
                        </button>
                    </div>
                    <div v-else class="empty-inline empty-inline--soft">{{ t('No attachments yet.') }}</div>
                </section>

                <div class="drawer-actions">
                    <el-button @click="state.composeOpen = false">{{ t('Cancel') }}</el-button>
                    <el-button type="primary" :loading="state.composeSending" @click="submitCompose()">{{ t('Send email') }}</el-button>
                </div>
            </div>
        </el-drawer>

        <el-drawer
            v-model="state.mailboxDrawerOpen"
            :direction="state.isMobile ? 'btt' : 'rtl'"
            :size="state.isMobile ? '96%' : '680px'"
            class="utility-drawer utility-drawer--mailbox"
            :title="t(state.mailboxFormMode === 'edit' ? 'Mailbox Settings' : 'Add Mailbox')"
        >
            <div class="drawer-form drawer-form--wide">
                <section class="drawer-section">
                    <div class="drawer-section__head">
                        <div>
                            <p class="section-kicker">{{ t('Identity') }}</p>
                            <h3>{{ t('Mailbox profile') }}</h3>
                        </div>
                        <p class="field-hint">{{ t('Choose a provider template before deciding on OAuth or manual settings.') }}</p>
                    </div>
                    <div class="field-grid">
                        <label class="field-label">
                            <span>{{ t('Email address') }}</span>
                            <el-input v-model="state.mailboxForm.email" :placeholder="t('name@example.com')" @input="handleMailboxEmailInput" />
                        </label>
                        <label class="field-label">
                            <span>{{ t('Display name') }}</span>
                            <el-input v-model="state.mailboxForm.name" :placeholder="t('Example: Work mailbox')" />
                        </label>
                    </div>
                    <label class="field-label">
                        <span>{{ t('Provider template') }}</span>
                        <el-select v-model="state.mailboxForm.provider_template" filterable :placeholder="t('Auto-detect or choose manually')" @change="handleProviderTemplateChange()">
                            <el-option v-for="provider in state.providerCatalog" :key="provider.id" :value="provider.id" :label="provider.label" />
                        </el-select>
                    </label>
                </section>

                <article v-if="activeProvider" class="glass-subpanel provider-spotlight">
                    <div>
                        <p class="section-kicker">{{ t('Suggested method') }}</p>
                        <h3>{{ activeProvider.label }}</h3>
                        <p>{{ activeProvider.description }}</p>
                    </div>
                    <div class="action-row action-row--wrap">
                        <el-button @click="applyCurrentProviderDefaults()">{{ t('Apply template') }}</el-button>
                        <el-button v-if="activeProvider.oauth?.web_auth_available" type="primary" @click="startProviderOAuth()">{{ activeProvider.oauth.label }}</el-button>
                    </div>
                    <p v-if="state.oauthStatus" class="muted-copy">{{ state.oauthStatus }}</p>
                </article>
                <section class="drawer-section drawer-section--compact">
                    <div class="drawer-section__head">
                        <div>
                            <p class="section-kicker">{{ t('Sync & Auth') }}</p>
                            <h3>{{ t('Connection strategy') }}</h3>
                        </div>
                    </div>
                    <div class="drawer-grid drawer-grid--two mailbox-auth-grid">
                        <label class="field-label field-label--inline field-label--switch">
                            <span>{{ t('Prefer OAuth') }}</span>
                            <el-switch v-model="state.mailboxForm.use_oauth" />
                        </label>
                        <label class="field-label">
                            <span>{{ t('Sync interval (sec)') }}</span>
                            <el-input-number v-model="state.mailboxForm.fetch_interval" :min="60" :max="3600" :step="60" />
                        </label>
                    </div>
                    <div class="toggle-cluster toggle-cluster--mailbox">
                        <label class="field-label field-label--inline field-label--switch toggle-cluster__item">
                            <span>{{ t('IMAP SSL') }}</span>
                            <el-switch v-model="state.mailboxForm.imap_use_ssl" />
                        </label>
                        <label class="field-label field-label--inline field-label--switch toggle-cluster__item">
                            <span>{{ t('SMTP SSL') }}</span>
                            <el-switch v-model="state.mailboxForm.smtp_use_ssl" />
                        </label>
                        <label class="field-label field-label--inline field-label--switch toggle-cluster__item">
                            <span>{{ t('SMTP TLS') }}</span>
                            <el-switch v-model="state.mailboxForm.smtp_use_tls" />
                        </label>
                    </div>
                </section>

                <section class="drawer-section">
                    <div class="drawer-section__head">
                        <div>
                            <p class="section-kicker">{{ t('IMAP') }}</p>
                            <h3>{{ t('Incoming mail settings') }}</h3>
                        </div>
                    </div>
                    <div class="field-grid">
                        <label class="field-label">
                            <span>{{ t('IMAP server') }}</span>
                            <el-input v-model="state.mailboxForm.imap_server" />
                        </label>
                        <label class="field-label">
                            <span>{{ t('IMAP port') }}</span>
                            <el-input-number v-model="state.mailboxForm.imap_port" :min="1" :max="65535" />
                        </label>
                        <label class="field-label">
                            <span>{{ t('IMAP username') }}</span>
                            <el-input v-model="state.mailboxForm.imap_username" />
                        </label>
                        <label class="field-label">
                            <span>{{ t('IMAP password') }}</span>
                            <el-input v-model="state.mailboxForm.imap_password" type="password" show-password :disabled="state.mailboxForm.use_oauth" :placeholder="t('Leave blank for OAuth')" />
                        </label>
                    </div>
                </section>

                <section class="drawer-section">
                    <div class="drawer-section__head">
                        <div>
                            <p class="section-kicker">{{ t('SMTP') }}</p>
                            <h3>{{ t('Outgoing mail settings') }}</h3>
                        </div>
                    </div>
                    <div class="field-grid">
                        <label class="field-label">
                            <span>{{ t('SMTP server') }}</span>
                            <el-input v-model="state.mailboxForm.smtp_server" />
                        </label>
                        <label class="field-label">
                            <span>{{ t('SMTP port') }}</span>
                            <el-input-number v-model="state.mailboxForm.smtp_port" :min="1" :max="65535" />
                        </label>
                        <label class="field-label">
                            <span>{{ t('SMTP username') }}</span>
                            <el-input v-model="state.mailboxForm.smtp_username" />
                        </label>
                        <label class="field-label">
                            <span>{{ t('SMTP password') }}</span>
                            <el-input v-model="state.mailboxForm.smtp_password" type="password" show-password :disabled="state.mailboxForm.use_oauth" :placeholder="t('Leave blank for OAuth')" />
                        </label>
                    </div>
                </section>

                <div class="drawer-actions">
                    <el-button @click="state.mailboxDrawerOpen = false">{{ t('Cancel') }}</el-button>
                    <el-button type="primary" :loading="state.mailboxSaving" @click="submitMailboxForm()">{{ t(state.mailboxFormMode === 'edit' ? 'Save settings' : 'Create mailbox') }}</el-button>
                </div>
            </div>
        </el-drawer>

        <el-drawer
            v-model="state.createUserDrawerOpen"
            :direction="state.isMobile ? 'btt' : 'rtl'"
            :size="state.isMobile ? '88%' : '460px'"
            class="utility-drawer"
            :title="t('Create User')"
        >
            <div class="drawer-form">
                <section class="drawer-section drawer-section--compact">
                    <div class="drawer-section__head">
                        <div>
                            <p class="section-kicker">Account</p>
                            <h3>{{ t('Basic profile') }}</h3>
                        </div>
                    </div>
                    <label class="field-label">
                        <span>Username</span>
                        <el-input v-model="state.createUserForm.username" />
                    </label>
                    <label class="field-label">
                        <span>Email</span>
                        <el-input v-model="state.createUserForm.email" />
                    </label>
                    <label class="field-label">
                        <span>Display name</span>
                        <el-input v-model="state.createUserForm.full_name" />
                    </label>
                    <label class="field-label">
                        <span>{{ t('Initial password') }}</span>
                        <el-input v-model="state.createUserForm.password" type="password" show-password />
                    </label>
                </section>

                <section class="drawer-section drawer-section--compact">
                    <div class="drawer-section__head">
                        <div>
                            <p class="section-kicker">Quota</p>
                            <h3>Mailbox limit</h3>
                        </div>
                        <div class="drawer-summary drawer-summary--single">
                            <div class="drawer-summary__item">
                                <span>{{ t('Current value') }}</span>
                                <strong>{{ state.createUserForm.max_mailboxes }}</strong>
                            </div>
                        </div>
                    </div>
                    <label class="field-label">
                        <span>Mailbox limit</span>
                        <el-input-number v-model="state.createUserForm.max_mailboxes" :min="1" :max="50" />
                    </label>
                </section>

                <div class="drawer-actions">
                    <el-button @click="state.createUserDrawerOpen = false">{{ t('Cancel') }}</el-button>
                    <el-button type="primary" :loading="state.userCreating" @click="submitCreateUser()">{{ t('Create User') }}</el-button>
                </div>
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
        UtilityControls,
        OverlayDrawers,
    },
    template: `
    <div class="jmail-app">
        <BootScreen v-if="state.booting" />
        <template v-else>
            <template v-if="!state.token || !state.user">
                <UtilityControls />
                <AuthShell />
            </template>
            <WorkspaceShell v-else />
        </template>
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

