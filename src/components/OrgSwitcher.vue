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
  <!-- With one organization there is nothing to switch to: show the name flat
       rather than a menu that opens onto a single item. -->
  <span
    v-if="!auth.hasMultipleCompanies"
    class="min-w-0 flex-1 truncate text-sm font-semibold text-fg"
  >
    {{ companyName }}
  </span>

  <DropdownMenu
    v-else
    class="min-w-0 flex-1"
    :items="items"
    @select="auth.switchCompany($event)"
  >
    <button
      type="button"
      :title="t('org.switch')"
      class="flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-hover"
    >
      <span class="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{{ companyName }}</span>
      <Icon
        icon="fa-solid fa-chevron-down"
        size="xs"
        class="shrink-0 text-faint"
      />
    </button>
  </DropdownMenu>
</template>
