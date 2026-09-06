<script setup lang="ts">
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useI18n } from 'vue-i18n'

// The two reasons a list can be empty besides "nothing has been added yet".
// Both used to render as the first-run empty state, so a failed load told the
// user to add their first product while their catalogue sat unreachable
// behind a network error, and a filter that matched nothing looked like a
// warehouse that had been emptied. Each now says what happened and offers the
// one thing that helps: try again, or drop the filters.
defineProps<{ state: 'error' | 'noMatches' }>()
defineEmits<{ retry: []; clear: [] }>()

const { t } = useI18n()
</script>

<template>
  <EmptyState
    v-if="state === 'error'"
    icon="fa-solid fa-triangle-exclamation"
    :title="t('errors.load')"
    :hint="t('errors.loadHint')"
  >
    <Button
      icon="fa-solid fa-arrow-rotate-right"
      @click="$emit('retry')"
    >
      {{ t('common.retry') }}
    </Button>
  </EmptyState>

  <EmptyState
    v-else
    icon="fa-solid fa-filter"
    :title="t('common.noMatches')"
    :hint="t('common.noMatchesHint')"
  >
    <Button @click="$emit('clear')">
      {{ t('common.clearFilters') }}
    </Button>
  </EmptyState>
</template>
