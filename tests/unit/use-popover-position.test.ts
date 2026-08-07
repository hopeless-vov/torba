import { usePopoverPosition } from '@/composables/use-popover-position'
import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

function elementAt(rect: Partial<DOMRect>): HTMLElement {
  const el = document.createElement('div')
  el.getBoundingClientRect = () =>
    ({
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON() {},
      ...rect,
    }) as DOMRect
  document.body.appendChild(el)
  return el
}

describe('usePopoverPosition', () => {
  let scope: ReturnType<typeof effectScope> | undefined

  beforeEach(() => {
    window.innerHeight = 800
    window.innerWidth = 400
  })

  afterEach(() => {
    scope?.stop()
    document.body.innerHTML = ''
  })

  it('anchors below the trigger when there is room', async () => {
    const trigger = ref(elementAt({ top: 100, bottom: 140, left: 20, right: 180, width: 160 }))
    scope = effectScope()
    const { openUpward, vertical } = scope.run(() => usePopoverPosition(trigger, 300))!
    await nextTick()

    expect(openUpward.value).toBe(false)
    expect(vertical.value).toEqual({ top: '144px' })
  })

  it('flips upward when the estimated panel would overflow the bottom of the viewport', async () => {
    const trigger = ref(elementAt({ top: 700, bottom: 740, left: 20, right: 180, width: 160 }))
    scope = effectScope()
    const { openUpward, vertical } = scope.run(() => usePopoverPosition(trigger, 300))!
    await nextTick()

    expect(openUpward.value).toBe(true)
    expect(vertical.value).toEqual({ bottom: '104px' })
  })

  it('stays anchored below when there is even less room above than below', async () => {
    // Near the top of the viewport: little space below AND above — flipping
    // would make things worse, so it should not.
    const trigger = ref(elementAt({ top: 10, bottom: 50, left: 20, right: 180, width: 160 }))
    scope = effectScope()
    const { openUpward } = scope.run(() => usePopoverPosition(trigger, 900))!
    await nextTick()

    expect(openUpward.value).toBe(false)
  })
})
