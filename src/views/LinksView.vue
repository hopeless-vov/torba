<script setup lang="ts">
import Avatar from '@/components/ui/Avatar.vue'
import Button from '@/components/ui/Button.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Icon from '@/components/ui/Icon.vue'
import TextInput from '@/components/ui/TextInput.vue'
import { usePersonalization } from '@/composables/use-personalization'
import { useReferenceStore } from '@/stores/reference'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
// A bare separator glyph — held in a const so the i18n lint doesn't read it as
// untranslated copy (it is punctuation, not text).
const sep = '/'
const reference = useReferenceStore()
const {
  categoryStats,
  addBrand,
  removeBrand,
  addCategory,
  removeCategory,
  linkCategory,
  unlinkCategory,
  setBrandCategories,
} = usePersonalization()

// The selected brand drives the right-hand panel. It falls back to the first
// brand when nothing is picked or the picked brand was just deleted, so the
// panel is never stranded on a stale id.
const sel = ref<string | null>(null)
const selectedId = computed<string | null>(() =>
  sel.value && reference.brandsById.has(sel.value) ? sel.value : (reference.brands[0]?.id ?? null),
)
const selectedName = computed(() => (selectedId.value ? reference.brandsById.get(selectedId.value)?.name : '') ?? '')
const linkedSet = computed(() => (selectedId.value ? reference.categoryIdsByBrand.get(selectedId.value) : null) ?? new Set<string>())

const brandRows = computed(() =>
  reference.brands.map((b) => ({
    id: b.id,
    name: b.name,
    count: reference.categoryIdsByBrand.get(b.id)?.size ?? 0,
    selected: b.id === selectedId.value,
  })),
)

// ── inline add ───────────────────────────────────────────────
const newBrand = ref('')
const newCategory = ref('')

async function submitBrand() {
  const name = newBrand.value.trim()
  if (!name) return
  const created = await addBrand(name)
  newBrand.value = ''
  if (created) sel.value = created.id
}

async function submitCategory() {
  const name = newCategory.value.trim()
  if (!name || !selectedId.value) return
  // A category added here belongs to the brand on screen, so link it at once.
  await addCategory(name, selectedId.value)
  newCategory.value = ''
}

// ── linking ──────────────────────────────────────────────────
function toggle(categoryId: string) {
  if (!selectedId.value) return
  if (linkedSet.value.has(categoryId)) unlinkCategory(selectedId.value, categoryId)
  else linkCategory(selectedId.value, categoryId)
}

function markAll() {
  if (!selectedId.value) return
  setBrandCategories(
    selectedId.value,
    reference.categories.map((c) => c.id),
  )
}

function clearAll() {
  if (!selectedId.value) return
  setBrandCategories(selectedId.value, [])
}

// ── deletion (destructive → confirm) ─────────────────────────
type Pending = { kind: 'brand' | 'category'; id: string; name: string }
const pending = ref<Pending | null>(null)
const confirmOpen = ref(false)

function askDelete(kind: Pending['kind'], id: string, name: string) {
  pending.value = { kind, id, name }
  confirmOpen.value = true
}
async function confirmDelete() {
  if (!pending.value) return
  if (pending.value.kind === 'brand') await removeBrand(pending.value.id)
  else await removeCategory(pending.value.id)
  confirmOpen.value = false
  pending.value = null
}
const confirmTitle = computed(() =>
  pending.value?.kind === 'brand'
    ? t('links.deleteBrandTitle', { name: pending.value?.name })
    : t('links.deleteCategoryTitle', { name: pending.value?.name ?? '' }),
)
const confirmMessage = computed(() =>
  pending.value?.kind === 'brand' ? t('links.deleteBrandMessage') : t('links.deleteCategoryMessage'),
)
</script>

<template>
  <div class="flex flex-col gap-5 p-6">
    <div>
      <h1 class="flex items-baseline gap-2.5 text-base font-semibold text-fg">
        {{ t('links.title') }}
        <span class="text-sm font-normal text-muted">{{ sep }} {{ t('links.subtitle') }}</span>
      </h1>
      <p class="mt-1 text-sm text-muted">
        {{ t('links.hint') }}
      </p>
    </div>

    <div class="grid grid-cols-1 overflow-hidden rounded-xl border border-line bg-panel md:grid-cols-[320px_1fr]">
      <!-- Brands -->
      <div class="flex flex-col border-b border-line md:border-b-0 md:border-r">
        <div class="flex items-center justify-between px-4 pt-4 pb-2">
          <span class="text-xs font-medium tracking-wide text-faint uppercase">{{ t('links.brands') }}</span>
          <span class="font-mono text-xs text-faint tabular-nums">{{ reference.brands.length }}</span>
        </div>

        <form
          class="flex items-center gap-2 px-4 pb-3"
          @submit.prevent="submitBrand"
        >
          <TextInput
            v-model="newBrand"
            class="flex-1"
            size="md"
            :placeholder="t('profile.brandPlaceholder')"
          />
          <Button
            type="submit"
            variant="primary"
            icon="fa-solid fa-plus"
            :disabled="!newBrand.trim()"
            :title="t('profile.addBrand')"
          />
        </form>

        <div class="flex max-h-[460px] flex-col gap-1 overflow-y-auto px-3 pb-3">
          <div
            v-for="b in brandRows"
            :key="b.id"
            class="group flex items-center gap-1 rounded-lg"
            :class="b.selected ? 'bg-surface-2' : 'hover:bg-row-hover'"
          >
            <button
              type="button"
              class="flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left"
              @click="sel = b.id"
            >
              <Avatar
                :name="b.name"
                size="sm"
                tone="muted"
              />
              <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="truncate text-sm font-medium text-fg">{{ b.name }}</span>
                <span class="font-mono text-xs text-faint">{{ t('links.brandMeta', { n: b.count }) }}</span>
              </span>
              <span
                v-if="b.selected"
                class="size-1.5 shrink-0 rounded-full bg-accent"
              />
            </button>
            <button
              type="button"
              class="mr-1.5 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-faint transition-colors hover:bg-hover hover:text-danger"
              :title="t('common.delete')"
              @click="askDelete('brand', b.id, b.name)"
            >
              <Icon
                icon="fa-solid fa-xmark"
                size="sm"
              />
            </button>
          </div>

          <p
            v-if="reference.brands.length === 0"
            class="px-3 py-6 text-center text-sm text-faint"
          >
            {{ t('links.noBrandsHint') }}
          </p>
        </div>
      </div>

      <!-- Categories of the selected brand -->
      <div class="flex flex-col">
        <template v-if="selectedId">
          <div class="flex flex-wrap items-start justify-between gap-3 px-6 pt-5 pb-1">
            <div class="min-w-0">
              <div class="text-sm font-semibold text-fg">
                {{ t('links.categoriesFor', { brand: selectedName }) }}
              </div>
              <div class="mt-0.5 text-xs text-muted">
                {{ t('links.categoriesForHint') }}
              </div>
            </div>
            <div class="flex shrink-0 gap-2">
              <Button
                size="sm"
                :disabled="reference.categories.length === 0"
                @click="markAll"
              >
                {{ t('links.markAll') }}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                :disabled="linkedSet.size === 0"
                @click="clearAll"
              >
                {{ t('links.clear') }}
              </Button>
            </div>
          </div>

          <form
            class="flex items-center gap-2 px-6 pt-3 pb-2"
            @submit.prevent="submitCategory"
          >
            <TextInput
              v-model="newCategory"
              class="flex-1"
              size="md"
              :placeholder="t('profile.categoryPlaceholder')"
            />
            <Button
              type="submit"
              variant="secondary"
              icon="fa-solid fa-plus"
              :disabled="!newCategory.trim()"
              :title="t('profile.addCategory')"
            >
              <span class="hidden sm:inline">{{ t('profile.addCategory') }}</span>
            </Button>
          </form>

          <div class="min-h-0 flex-1 overflow-y-auto px-6 pt-2 pb-4">
            <div
              v-if="reference.categories.length > 0"
              class="grid grid-cols-1 gap-2 sm:grid-cols-2"
            >
              <div
                v-for="c in reference.categories"
                :key="c.id"
                class="flex items-center gap-1 rounded-lg border bg-surface"
                :class="linkedSet.has(c.id) ? 'border-accent-line' : 'border-line'"
              >
                <button
                  type="button"
                  class="flex flex-1 items-center gap-3 rounded-lg px-3.5 py-3 text-left"
                  @click="toggle(c.id)"
                >
                  <span
                    class="flex size-[18px] shrink-0 items-center justify-center rounded-[5px]"
                    :class="
                      linkedSet.has(c.id)
                        ? 'bg-accent text-on-accent'
                        : 'border border-line-strong text-transparent'
                    "
                  >
                    <Icon
                      icon="fa-solid fa-check"
                      size="xs"
                    />
                  </span>
                  <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span class="truncate text-sm text-fg">{{ c.name }}</span>
                    <span class="font-mono text-xs text-faint">
                      {{ t('links.categoryMeta', categoryStats(c.id)) }}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  class="mr-1.5 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-faint transition-colors hover:bg-hover hover:text-danger"
                  :title="t('common.delete')"
                  @click="askDelete('category', c.id, c.name)"
                >
                  <Icon
                    icon="fa-solid fa-xmark"
                    size="sm"
                  />
                </button>
              </div>
            </div>

            <EmptyState
              v-else
              icon="fa-solid fa-layer-group"
              :title="t('links.noCategories')"
              :hint="t('links.noCategoriesHint')"
            />
          </div>

          <div
            v-if="reference.categories.length > 0"
            class="flex items-center justify-between border-t border-line-soft px-6 py-3 text-xs text-muted"
          >
            <span>
              {{ t('links.selectedOf') }}
              <span class="font-mono text-fg tabular-nums">{{ linkedSet.size }}</span>
              {{ sep }}
              <span class="font-mono text-fg tabular-nums">{{ reference.categories.length }}</span>
            </span>
            <span class="text-faint">{{ t('links.savedImmediately') }}</span>
          </div>
        </template>

        <EmptyState
          v-else
          icon="fa-solid fa-layer-group"
          :title="t('links.noBrands')"
          :hint="t('links.noBrandsHint')"
        />
      </div>
    </div>

    <ConfirmDialog
      v-model:open="confirmOpen"
      :title="confirmTitle"
      :message="confirmMessage"
      :confirm-label="t('common.delete')"
      :cancel-label="t('common.cancel')"
      @confirm="confirmDelete"
    />
  </div>
</template>
