# Switches Plugin — Test Results

Date: 2026-03-02
Branch: feature/rollback-stable
Status: **ALL PASSED**

---

## 1. Simple rectangle with live controls

Prompt: "Create a red square"

- [x] Rectangle created on canvas
- [x] Controls show with green dots
- [x] Change Fill Color → square updates live
- [x] Change Corner Radius → square updates live
- [x] Change Size → square resizes (both width & height)
- [x] Deselect, then reselect → controls restore
- [x] After restore, controls still work

---

## 2. Generator with single color

Prompt: "Create a grid of colored circles, 6 columns"

- [x] Grid created on canvas
- [x] Drag Columns slider → grid regenerates live
- [x] Drag Size slider → circles resize live
- [x] Change Color → all circles update to new color
- [x] Console: auto-apply values show correct updated color (not defaults)
- [x] Console: action-executor batch done with 0 errors

---

## 3. Generator with gradient (multi-stop color)

From test 2, prompt: "Change the color to a gradient from warm to cool across the grid"

- [x] Old single Color control removed (not duplicated)
- [x] New Gradient control with two stops appears
- [x] Grid renders with gradient colors
- [x] Drag one gradient stop → grid updates live
- [x] Console: auto-apply values show updated hex (not defaults)
- [x] Other controls (columns, size) still work after gradient change

---

## 4. Persistence across deselect/reselect (generator)

With gradient grid from test 3:

- [x] Adjust columns to non-default value
- [x] Adjust a gradient color to something distinctive
- [x] Deselect → controls disappear
- [x] Reselect → controls restore with adjusted values
- [x] Change a control after restore → grid updates

---

## 5. Stroke color live update

Select a rectangle, prompt: "Add a 4px blue stroke"

- [x] Stroke appears
- [x] Stroke color control shows
- [x] Change stroke color → stroke updates live

---

## 6. Drop shadow with coordinated controls

Select a rectangle, prompt: "Add a drop shadow"

- [x] Shadow appears
- [x] Controls show (blur, spread, offset, etc.)
- [x] Drag blur slider → shadow updates live
- [x] Drag spread slider → shadow updates live

---

## 7. API key management

- [x] `/key status` → reports key state
- [x] `/key sk-ant-...` → "API key saved"
- [x] `/key status` → "API key is set"
- [x] Close/reopen plugin → key persists
- [x] `/key clear` → "API key cleared"

---

## 8. Edge cases

- [x] `/clear` → clears controls and messages
- [x] No selection + prompt → clarifying message (no crash)
- [x] Rapid slider dragging → no errors, updates on settle

---

## Bugs Found

None — all tests passed.
