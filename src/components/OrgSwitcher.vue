<script setup lang="ts">
import type { MenuItem } from '@/components/ui/DropdownMenu.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import Icon from '@/components/ui/Icon.vue'
import { useAuthStore } from '@/stores/auth'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const auth = useAuthStore()

const companyName = computed(() => auth.company?.name ?? t('app.name'))

// The second line: your role here, which is the one thing that differs
// between organizations and that you cannot see anywhere else in the chrome.
const subtitle = computed(() => (auth.role ? t(`org.roles.${auth.role}`) : ''))

// The active organization is ticked rather than hidden, so the list length
// stays stable and the user can see which one they are in without opening
// anything else.
const items = computed<MenuItem[]>(() =>
  auth.memberships.map((m) => ({
    value: m.company_id,
    label: m.company.name,
    icon: m.company_id === auth.activeCompanyId ? 'fa-solid fa-check' : undefined,
  })),
)
</script>

<template>
  <!-- With one organization there is nothing to switch to: the same tile and
       two lines render flat, without a menu that would open onto a single
       item. -->
  <div
    v-if="!auth.hasMultipleCompanies"
    class="flex min-w-0 flex-1 items-center gap-2.5 p-1.5"
  >
    <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-on-accent">
      <Icon
        icon="fa-solid fa-bag-shopping"
        size="sm"
      />
    </span>
    <span class="flex min-w-0 flex-1 flex-col leading-tight">
      <span class="truncate text-sm font-semibold text-fg">{{ companyName }}</span>
      <span
        v-if="subtitle"
        class="truncate text-xs text-faint"
      >{{ subtitle }}</span>
    </span>
  </div>

  <DropdownMenu
    v-else
    class="min-w-0 flex-1"
    :items="items"
    :heading="t('org.switch')"
    @select="auth.switchCompany($event)"
  >
    <button
      type="button"
      :title="t('org.switch')"
      class="flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-hover"
    >
      <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-on-accent">
        <Icon
          icon="fa-solid fa-bag-shopping"
          size="sm"
        />
      </span>
      <span class="flex min-w-0 flex-1 flex-col leading-tight">
        <span class="truncate text-sm font-semibold text-fg">{{ companyName }}</span>
        <span
          v-if="subtitle"
          class="truncate text-xs text-faint"
        >{{ subtitle }}</span>
      </span>
      <Icon
        icon="fa-solid fa-sort"
        size="xs"
        class="shrink-0 text-faint"
      />
    </button>
  </DropdownMenu>
</template>
