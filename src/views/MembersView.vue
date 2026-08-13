<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import Select from '@/components/ui/Select.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { useMembers } from '@/composables/use-members'
import { useAuthStore } from '@/stores/auth'
import type { CompanyMember, Invitation, MembershipRole } from '@/types/database'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const auth = useAuthStore()
const {
  members,
  invitations,
  canManage,
  isOwner,
  assignableRoles,
  load,
  invite,
  inviteLink,
  revoke,
  setRole,
  remove,
} = useMembers()

const email = ref('')
const role = ref<Invitation['role']>('member')
const createdLink = ref('')
const copied = ref(false)

// Confirmation is a two-step: the dialog needs to know who it is about.
const pendingRemoval = ref<CompanyMember | null>(null)

onMounted(load)

const roleOptions = computed(() =>
  assignableRoles.value.map((r) => ({ value: r, label: t(`org.roles.${r}`) })),
)

// Ownership is transferred through the role dropdown on an existing member,
// never handed out in an invitation.
const invitableRoles = computed(() => roleOptions.value.filter((o) => o.value !== 'owner'))

// The legend is for everyone, including a viewer who cannot manage anyone:
// the roles are the first thing a new user has no way to guess.
const ROLE_ORDER: MembershipRole[] = ['owner', 'admin', 'member', 'viewer']

function roleTone(r: MembershipRole) {
  if (r === 'owner') return 'accent'
  if (r === 'admin') return 'info'
  if (r === 'viewer') return 'neutral'
  return 'neutral'
}

function isSelf(member: CompanyMember) {
  return member.user_id === auth.user?.id
}

// An admin may manage members but must not touch owners or other admins —
// that is the owner's call, and the database enforces the same rule.
function canEdit(member: CompanyMember) {
  if (!canManage.value) return false
  if (isSelf(member)) return false
  return isOwner.value || member.role !== 'owner'
}

async function submitInvite() {
  const address = email.value.trim()
  if (!address) return
  const link = await invite(address, role.value)
  if (link) {
    createdLink.value = link
    copied.value = false
    email.value = ''
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(createdLink.value)
    copied.value = true
  } catch {
    // Clipboard access can be denied; the link stays selectable on screen.
  }
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

async function confirmRemoval() {
  const member = pendingRemoval.value
  pendingRemoval.value = null
  if (member) await remove(member.user_id)
}
</script>

<template>
  <div class="flex flex-col gap-5 p-4 sm:p-6">
    <header class="flex flex-col gap-1">
      <h1 class="text-lg font-semibold text-fg">
        {{ t('members.title') }}
      </h1>
      <p class="text-sm text-muted">
        {{ t('members.subtitle') }}
      </p>
    </header>

    <div class="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_22rem]">
      <div class="flex min-w-0 flex-col gap-5">
        <!-- Members -->
        <section class="flex flex-col rounded-xl border border-line bg-panel">
          <ul class="flex flex-col divide-y divide-line-soft">
            <li
              v-for="member in members"
              :key="member.user_id"
              class="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-fg">
                  {{ member.full_name || member.email }}
                  <span
                    v-if="isSelf(member)"
                    class="text-xs font-normal text-faint"
                  >{{ t('members.youSuffix') }}</span>
                </p>
                <p class="truncate font-mono text-xs text-faint">
                  {{ member.email }}
                </p>
              </div>

              <Select
                v-if="canEdit(member)"
                :model-value="member.role"
                :options="roleOptions"
                size="sm"
                class="w-40"
                @update:model-value="setRole(member.user_id, $event as MembershipRole)"
              />
              <Badge
                v-else
                :tone="roleTone(member.role)"
              >
                {{ t(`org.roles.${member.role}`) }}
              </Badge>

              <Button
                v-if="canEdit(member) || isSelf(member)"
                variant="ghost"
                size="sm"
                icon="fa-solid fa-trash"
                :title="isSelf(member) ? t('members.leave') : t('members.remove')"
                @click="pendingRemoval = member"
              />
            </li>
          </ul>

          <p
            v-if="!canManage"
            class="border-t border-line-soft px-4 py-3 text-xs text-faint sm:px-5"
          >
            {{ t('members.readOnly') }}
          </p>
        </section>

        <!-- What the roles actually mean. Shown to every role: the badge on
             your own row is meaningless until you know what it grants. -->
        <section class="flex flex-col rounded-xl border border-line bg-panel p-4 sm:p-5">
          <h2 class="text-sm font-semibold text-fg">
            {{ t('members.rolesTitle') }}
          </h2>
          <p class="mt-1 text-xs text-muted">
            {{ t('members.rolesHint') }}
          </p>
          <dl class="mt-4 flex flex-col gap-3">
            <div
              v-for="r in ROLE_ORDER"
              :key="r"
              class="flex flex-col gap-1 sm:flex-row sm:gap-3"
            >
              <dt class="sm:w-32 sm:shrink-0">
                <Badge :tone="roleTone(r)">
                  {{ t(`org.roles.${r}`) }}
                </Badge>
              </dt>
              <dd class="text-xs leading-relaxed text-muted">
                {{ t(`org.roleHints.${r}`) }}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <!-- Invite + pending -->
      <div
        v-if="canManage"
        class="flex flex-col gap-5"
      >
        <section class="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4 sm:p-5">
          <div>
            <h2 class="text-sm font-semibold text-fg">
              {{ t('members.inviteTitle') }}
            </h2>
            <p class="mt-1 text-xs text-muted">
              {{ t('members.inviteHint') }}
            </p>
          </div>

          <TextInput
            v-model="email"
            type="email"
            :label="t('members.email')"
            :placeholder="t('members.emailPlaceholder')"
            autocomplete="off"
          />
          <Select
            v-model="role"
            :label="t('members.role')"
            :options="invitableRoles"
          />
          <Button
            variant="primary"
            icon="fa-solid fa-plus"
            :disabled="!email.trim()"
            @click="submitInvite"
          >
            {{ t('members.invite') }}
          </Button>

          <div
            v-if="createdLink"
            class="flex flex-col gap-2 rounded-lg border border-accent-line bg-accent-soft p-3"
          >
            <p class="text-xs font-medium text-fg">
              {{ t('members.linkTitle') }}
            </p>
            <p class="font-mono text-xs break-all text-muted">
              {{ createdLink }}
            </p>
            <p class="text-xs text-faint">
              {{ t('members.linkHint') }}
            </p>
            <Button
              size="sm"
              :icon="copied ? 'fa-solid fa-check' : 'fa-solid fa-copy'"
              @click="copyLink"
            >
              {{ copied ? t('members.copied') : t('members.copy') }}
            </Button>
          </div>
        </section>

        <section class="flex flex-col rounded-xl border border-line bg-panel">
          <h2 class="px-4 py-3 text-sm font-semibold text-fg sm:px-5">
            {{ t('members.pending') }}
          </h2>
          <p
            v-if="invitations.length === 0"
            class="border-t border-line-soft px-4 py-4 text-sm text-faint sm:px-5"
          >
            {{ t('members.pendingEmpty') }}
          </p>
          <ul
            v-else
            class="flex flex-col divide-y divide-line-soft border-t border-line-soft"
          >
            <li
              v-for="inv in invitations"
              :key="inv.id"
              class="flex items-center gap-3 px-4 py-3 sm:px-5"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate font-mono text-xs text-fg">
                  {{ inv.email }}
                </p>
                <p class="text-xs text-faint">
                  {{ t('members.pendingMeta', { role: t(`org.roles.${inv.role}`), date: formatDate(inv.expires_at) }) }}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon="fa-solid fa-copy"
                :title="t('members.copy')"
                @click="createdLink = inviteLink(inv.token); copied = false"
              />
              <Button
                variant="ghost"
                size="sm"
                icon="fa-solid fa-xmark"
                :title="t('members.revoke')"
                @click="revoke(inv.id)"
              />
            </li>
          </ul>
        </section>
      </div>
    </div>

    <ConfirmDialog
      :open="!!pendingRemoval"
      :title="pendingRemoval && isSelf(pendingRemoval) ? t('members.leave') : t('members.remove')"
      :message="
        pendingRemoval && isSelf(pendingRemoval) ? t('members.leaveConfirm') : t('members.removeConfirm')
      "
      :confirm-label="t('common.confirm')"
      :cancel-label="t('common.cancel')"
      @update:open="!$event && (pendingRemoval = null)"
      @confirm="confirmRemoval"
    />
  </div>
</template>
