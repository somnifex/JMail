import { useJmailStore } from '../store.js';

const { computed } = window.Vue;

export const OverviewView = {
    template: `
    <section class="view-stack view-stack--overview">
        <article class="glass-panel hero-panel hero-panel--overview">
            <div class="hero-panel__copy">
                <p class="section-kicker">Mission Control</p>
                <h2>先看全局压力，再进入具体邮件流。</h2>
                <p>这里把未读、星标、账户健康和同步节奏压缩到一个入口，适合作为每天开始处理邮件的第一眼。</p>
                <div class="action-row">
                    <el-button type="primary" round @click="openView('inbox')">进入收件箱</el-button>
                    <el-button round @click="startMailboxOnboarding()">接入新邮箱</el-button>
                </div>
            </div>
            <div class="hero-panel__orbital">
                <div class="orbital-ring orbital-ring--core">
                    <span>未读</span>
                    <strong>{{ aggregateStats.unread || 0 }}</strong>
                </div>
                <div class="orbital-mini" v-for="item in heroStats.slice(1)" :key="item.label">
                    <span>{{ item.label }}</span>
                    <strong>{{ item.value }}</strong>
                </div>
            </div>
        </article>

        <div class="metric-wall">
            <article class="metric-card" v-for="card in summaryCards" :key="card.label">
                <span>{{ card.label }}</span>
                <strong>{{ card.value }}</strong>
                <p>{{ card.copy }}</p>
            </article>
        </div>

        <div class="overview-grid">
            <article class="glass-panel panel-card panel-card--accounts">
                <div class="section-head">
                    <div>
                        <p class="section-kicker">邮箱健康</p>
                        <h3>账户脉搏</h3>
                    </div>
                    <el-button text @click="openView('accounts')">管理邮箱</el-button>
                </div>
                <div class="soft-list">
                    <div class="soft-list-card" v-for="mailbox in mailboxHealthCards.slice(0, 6)" :key="mailbox.id">
                        <div>
                            <strong>{{ mailbox.name || mailbox.email }}</strong>
                            <p>{{ mailbox.email }}</p>
                        </div>
                        <div class="soft-list-card__meta">
                            <span class="status-pill" :data-tone="mailboxStatusTone(mailbox.status)">{{ mailboxStatusLabel(mailbox.status) }}</span>
                            <b>{{ getMailboxStats(mailbox.id).unread || 0 }} 未读</b>
                        </div>
                    </div>
                    <div v-if="!mailboxHealthCards.length" class="empty-inline">还没有接入邮箱，先从 Gmail / Outlook / QQ 开始。</div>
                </div>
            </article>

            <article class="glass-panel panel-card panel-card--system">
                <div class="section-head">
                    <div>
                        <p class="section-kicker">同步边界</p>
                        <h3>系统与配额</h3>
                    </div>
                </div>
                <div class="info-grid">
                    <div>
                        <span>版本</span>
                        <strong>{{ state.systemInfo?.app_version || '未记录' }}</strong>
                    </div>
                    <div>
                        <span>账户上限</span>
                        <strong>{{ state.user?.max_mailboxes || 0 }}</strong>
                    </div>
                    <div>
                        <span>已接入</span>
                        <strong>{{ state.mailboxes.length }}</strong>
                    </div>
                    <div>
                        <span>未读总量</span>
                        <strong>{{ state.systemStats?.stats?.unread_emails || aggregateStats.unread || 0 }}</strong>
                    </div>
                </div>
                <div class="quota-bar">
                    <span :style="{ width: mailboxUsagePercent + '%' }"></span>
                </div>
                <p class="muted-copy">邮箱额度使用 {{ mailboxUsagePercent }}%，手机端会优先把统一收件箱放在拇指热区内。</p>
            </article>

            <article class="glass-panel panel-card panel-card--focus">
                <div class="section-head">
                    <div>
                        <p class="section-kicker">邮件工作流</p>
                        <h3>今天先做什么</h3>
                    </div>
                </div>
                <div class="timeline-list">
                    <div class="timeline-item">
                        <strong>1. 看总量</strong>
                        <p>先从统一收件箱判定未读压力，再决定是否切到单邮箱精处理。</p>
                    </div>
                    <div class="timeline-item">
                        <strong>2. 看异常</strong>
                        <p>优先修复同步异常或长时间未同步的邮箱，避免信息断层。</p>
                    </div>
                    <div class="timeline-item">
                        <strong>3. 进阅读</strong>
                        <p>进入三栏阅读工作台，用快捷键或触控连续处理邮件。</p>
                    </div>
                </div>
            </article>

            <article v-if="isAdmin" class="glass-panel panel-card panel-card--admin">
                <div class="section-head">
                    <div>
                        <p class="section-kicker">管理员视角</p>
                        <h3>系统规模</h3>
                    </div>
                    <el-button text @click="openView('admin')">打开系统设置</el-button>
                </div>
                <div class="metric-grid">
                    <div>
                        <span>总用户</span>
                        <strong>{{ state.adminStats?.total_users || 0 }}</strong>
                    </div>
                    <div>
                        <span>总邮箱</span>
                        <strong>{{ state.adminStats?.total_mailboxes || 0 }}</strong>
                    </div>
                    <div>
                        <span>总邮件</span>
                        <strong>{{ state.adminStats?.total_emails || 0 }}</strong>
                    </div>
                    <div>
                        <span>今日新增</span>
                        <strong>{{ state.adminStats?.today_emails || 0 }}</strong>
                    </div>
                </div>
            </article>
        </div>
    </section>
    `,
    setup() {
        const store = useJmailStore();
        const summaryCards = computed(() => [
            {
                label: '统一收件箱',
                value: `${store.aggregateStats.value.unread || 0} 未读`,
                copy: '把多个邮箱合并成一条邮件流之后，优先级更容易被看见。',
            },
            {
                label: '星标对话',
                value: store.aggregateStats.value.flagged || 0,
                copy: '保留需要持续跟进的会话，不会被新的未读邮件淹没。',
            },
            {
                label: '账户健康',
                value: `${store.aggregateStats.value.errors || 0} 异常`,
                copy: '同步错误会直接影响“整体视角”，因此被提升到总览层。',
            },
            {
                label: '邮箱容量',
                value: `${store.state.mailboxes.length}/${store.state.user?.max_mailboxes || 0}`,
                copy: '你可以继续扩展邮箱接入，但始终知道剩余配额。',
            },
        ]);

        return {
            ...store,
            summaryCards,
        };
    },
};

export const AccountsView = {
    template: `
    <section class="view-stack view-stack--accounts">
        <article class="glass-panel hero-panel hero-panel--accounts">
            <div class="hero-panel__copy">
                <p class="section-kicker">Mailbox Studio</p>
                <h2>把接入、识别、同步和维护收束到同一个工作台。</h2>
                <p>这里不再只是“填写服务器配置”。你可以先从服务商卡片开始，再决定 OAuth 还是手动接入。</p>
                <div class="action-row">
                    <el-button type="primary" round @click="startMailboxOnboarding()">新增邮箱</el-button>
                    <el-button round @click="openView('inbox')">返回收件箱</el-button>
                </div>
            </div>
            <div class="hero-panel__sidekick">
                <div class="side-stat">
                    <span>已连接邮箱</span>
                    <strong>{{ state.mailboxes.length }}</strong>
                </div>
                <div class="side-stat">
                    <span>同步异常</span>
                    <strong>{{ aggregateStats.errors || 0 }}</strong>
                </div>
            </div>
        </article>

        <article class="glass-panel panel-card">
            <div class="section-head">
                <div>
                    <p class="section-kicker">推荐服务商</p>
                    <h3>快速起步</h3>
                </div>
            </div>
            <div class="provider-grid">
                <button
                    v-for="provider in state.providerCatalog.slice(0, 8)"
                    :key="provider.id"
                    type="button"
                    class="provider-card"
                    @click="startMailboxOnboarding(provider)"
                >
                    <div>
                        <strong>{{ provider.label }}</strong>
                        <p>{{ provider.description }}</p>
                    </div>
                    <span>{{ provider.recommended_auth_mode === 'oauth' ? 'OAuth 优先' : '手动接入' }}</span>
                </button>
            </div>
        </article>

        <article class="glass-panel panel-card">
            <div class="section-head">
                <div>
                    <p class="section-kicker">已接入邮箱</p>
                    <h3>账户列表</h3>
                </div>
            </div>
            <div class="mailbox-grid">
                <article class="mailbox-card" v-for="mailbox in state.mailboxes" :key="mailbox.id">
                    <div class="mailbox-card__head">
                        <div>
                            <h4>{{ mailbox.name || mailbox.email }}</h4>
                            <p>{{ mailbox.email }}</p>
                        </div>
                        <span class="status-pill" :data-tone="mailboxStatusTone(mailbox.status)">{{ mailboxStatusLabel(mailbox.status) }}</span>
                    </div>
                    <div class="mailbox-card__stats">
                        <div>
                            <span>未读</span>
                            <strong>{{ getMailboxStats(mailbox.id).unread || 0 }}</strong>
                        </div>
                        <div>
                            <span>总量</span>
                            <strong>{{ getMailboxStats(mailbox.id).total || 0 }}</strong>
                        </div>
                        <div>
                            <span>同步</span>
                            <strong>{{ describeLastFetch(mailbox) }}</strong>
                        </div>
                    </div>
                    <div class="mailbox-card__meta">
                        <span>{{ mailboxAuthLabel(mailbox) }}</span>
                        <span v-if="mailbox.last_error">{{ mailbox.last_error }}</span>
                    </div>
                    <div class="action-row action-row--wrap">
                        <el-button round @click="openMailboxInbox(mailbox)">查看邮件</el-button>
                        <el-button round @click="syncMailbox(mailbox)" :loading="state.syncing">立即同步</el-button>
                        <el-button round @click="openMailboxDrawer('edit', mailbox)">编辑</el-button>
                        <el-button round type="danger" plain @click="deleteMailbox(mailbox)">删除</el-button>
                    </div>
                </article>
                <div v-if="!state.mailboxes.length" class="empty-panel empty-panel--grid">
                    <div class="empty-panel__icon">户</div>
                    <h3>还没有接入任何邮箱</h3>
                    <p>先选一个服务商开始，或者直接进入自定义 IMAP / SMTP 接入。</p>
                </div>
            </div>
        </article>
    </section>
    `,
    setup() {
        return { ...useJmailStore() };
    },
};

export const AdminView = {
    template: `
    <section class="view-stack">
        <article class="glass-panel hero-panel hero-panel--admin">
            <div class="hero-panel__copy">
                <p class="section-kicker">System Control</p>
                <h2>把注册、配额和同步节奏集中控制。</h2>
                <p>这部分主要面向运维和管理员，避免让早期体验者看到任何不完整的控制元素。</p>
            </div>
            <div class="metric-grid metric-grid--compact">
                <div>
                    <span>用户</span>
                    <strong>{{ state.adminStats?.total_users || 0 }}</strong>
                </div>
                <div>
                    <span>邮箱</span>
                    <strong>{{ state.adminStats?.total_mailboxes || 0 }}</strong>
                </div>
                <div>
                    <span>邮件</span>
                    <strong>{{ state.adminStats?.total_emails || 0 }}</strong>
                </div>
                <div>
                    <span>今日</span>
                    <strong>{{ state.adminStats?.today_emails || 0 }}</strong>
                </div>
            </div>
        </article>

        <div class="overview-grid">
            <article class="glass-panel panel-card">
                <div class="section-head">
                    <div>
                        <p class="section-kicker">运行参数</p>
                        <h3>系统设置</h3>
                    </div>
                </div>
                <div class="form-stack">
                    <label class="field-label field-label--inline">
                        <span>允许注册</span>
                        <el-switch v-model="state.adminSettings.allow_registration" />
                    </label>
                    <label class="field-label">
                        <span>默认邮箱上限</span>
                        <el-input-number v-model="state.adminSettings.default_max_mailboxes_per_user" :min="1" :max="50" />
                    </label>
                    <label class="field-label">
                        <span>默认同步间隔（秒）</span>
                        <el-input-number v-model="state.adminSettings.default_fetch_interval" :min="60" :max="3600" :step="60" />
                    </label>
                    <label class="field-label">
                        <span>单用户最大邮件数</span>
                        <el-input-number v-model="state.adminSettings.max_emails_per_user" :min="100" :max="10000" :step="100" />
                    </label>
                    <el-button type="primary" round :loading="state.adminSaving" @click="submitAdminSettings()">保存系统设置</el-button>
                </div>
            </article>

            <article class="glass-panel panel-card">
                <div class="section-head">
                    <div>
                        <p class="section-kicker">最近用户</p>
                        <h3>系统活跃度</h3>
                    </div>
                    <el-button text @click="openView('users')">打开用户管理</el-button>
                </div>
                <div class="soft-list">
                    <div class="soft-list-card" v-for="user in state.adminStats?.recent_users || []" :key="user.id">
                        <div>
                            <strong>{{ user.full_name || user.username }}</strong>
                            <p>{{ user.email }}</p>
                        </div>
                        <div class="soft-list-card__meta">
                            <span>{{ userRoleLabel(user.role) }}</span>
                            <b>{{ userStatusLabel(user.status) }}</b>
                        </div>
                    </div>
                </div>
            </article>
        </div>
    </section>
    `,
    setup() {
        return { ...useJmailStore() };
    },
};

export const UsersView = {
    template: `
    <section class="view-stack">
        <article class="glass-panel hero-panel hero-panel--users">
            <div class="hero-panel__copy">
                <p class="section-kicker">People</p>
                <h2>用户、权限和恢复动作在这里集中完成。</h2>
                <p>把高频运维动作缩短成更直接的按钮序列，避免在多个页面间来回切换。</p>
            </div>
            <div class="action-row">
                <el-button type="primary" round @click="openCreateUserDrawer()">创建用户</el-button>
                <el-button round @click="loadAdminUsers(true)">刷新列表</el-button>
            </div>
        </article>

        <div class="user-grid">
            <article class="user-card" v-for="user in state.adminUsers" :key="user.id">
                <div class="user-card__head">
                    <div>
                        <h4>{{ user.full_name || user.username }}</h4>
                        <p>{{ user.email }}</p>
                    </div>
                    <span class="status-pill" :data-tone="user.status === 'active' ? 'success' : 'muted'">{{ userStatusLabel(user.status) }}</span>
                </div>
                <div class="user-card__stats">
                    <div>
                        <span>角色</span>
                        <strong>{{ userRoleLabel(user.role) }}</strong>
                    </div>
                    <div>
                        <span>邮箱上限</span>
                        <strong>{{ user.max_mailboxes }}</strong>
                    </div>
                    <div>
                        <span>创建时间</span>
                        <strong>{{ formatDateTime(user.created_at) }}</strong>
                    </div>
                </div>
                <div class="action-row action-row--wrap">
                    <el-button round @click="generateRecoveryCode(user)">恢复码</el-button>
                    <el-button round @click="resetUserPassword(user)">重置密码</el-button>
                    <el-button round type="danger" plain @click="deleteUser(user)">删除</el-button>
                </div>
            </article>
        </div>
    </section>
    `,
    setup() {
        return { ...useJmailStore() };
    },
};

export const ProfileView = {
    template: `
    <section class="view-stack">
        <article class="glass-panel hero-panel hero-panel--profile">
            <div class="hero-panel__copy">
                <p class="section-kicker">Identity</p>
                <h2>把个人资料和账号安全收进一个安静空间。</h2>
                <p>这里不放多余干扰，只保留你自己真正会频繁使用的身份与密码操作。</p>
            </div>
            <div class="hero-panel__sidekick">
                <div class="side-stat">
                    <span>用户名</span>
                    <strong>{{ state.user?.username || '-' }}</strong>
                </div>
                <div class="side-stat">
                    <span>角色</span>
                    <strong>{{ userRoleLabel(state.user?.role) }}</strong>
                </div>
            </div>
        </article>

        <div class="overview-grid">
            <article class="glass-panel panel-card">
                <div class="section-head">
                    <div>
                        <p class="section-kicker">个人资料</p>
                        <h3>显示信息</h3>
                    </div>
                </div>
                <div class="form-stack">
                    <label class="field-label">
                        <span>邮箱</span>
                        <el-input :model-value="state.user?.email || ''" disabled />
                    </label>
                    <label class="field-label">
                        <span>用户名</span>
                        <el-input :model-value="state.user?.username || ''" disabled />
                    </label>
                    <label class="field-label">
                        <span>显示名称</span>
                        <el-input v-model="state.profileForm.full_name" placeholder="输入你的名字" />
                    </label>
                    <el-button type="primary" round :loading="state.profileSaving" @click="submitProfile()">保存资料</el-button>
                </div>
            </article>

            <article class="glass-panel panel-card">
                <div class="section-head">
                    <div>
                        <p class="section-kicker">账号安全</p>
                        <h3>修改密码</h3>
                    </div>
                </div>
                <div class="form-stack">
                    <label class="field-label">
                        <span>当前密码</span>
                        <el-input v-model="state.passwordForm.current_password" type="password" show-password />
                    </label>
                    <label class="field-label">
                        <span>新密码</span>
                        <el-input v-model="state.passwordForm.new_password" type="password" show-password />
                    </label>
                    <label class="field-label">
                        <span>确认新密码</span>
                        <el-input v-model="state.passwordForm.confirm_password" type="password" show-password />
                    </label>
                    <el-button type="primary" round :loading="state.passwordSaving" @click="submitPassword()">更新密码</el-button>
                </div>
            </article>
        </div>
    </section>
    `,
    setup() {
        return { ...useJmailStore() };
    },
};
