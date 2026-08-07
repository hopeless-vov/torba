import { useElementBounding, useWindowSize } from '@vueuse/core'
import { computed, type MaybeRefOrGetter, type Ref,toValue } from 'vue'

/**
 * Anchors a floating panel to `triggerRef`, opening upward instead of down
 * when there isn't `estimatedHeight` px of room below but there is above —
 * without it, a Combobox/DropdownMenu opened near the bottom of a phone
 * screen renders (partly) off-screen instead of flipping.
 */
export function usePopoverPosition(triggerRef: Ref<HTMLElement | null>, estimatedHeight: MaybeRefOrGetter<number>) {
  const { top, bottom, left, right, width } = useElementBounding(triggerRef)
  const { height: windowHeight, width: windowWidth } = useWindowSize()

  const openUpward = computed(() => {
    const spaceBelow = windowHeight.value - bottom.value
    const spaceAbove = top.value
    return spaceBelow < toValue(estimatedHeight) && spaceAbove > spaceBelow
  })

  const vertical = computed(() =>
    openUpward.value ? { bottom: `${windowHeight.value - top.value + 4}px` } : { top: `${bottom.value + 4}px` },
  )

  return { top, bottom, left, right, width, windowWidth, openUpward, vertical }
}
