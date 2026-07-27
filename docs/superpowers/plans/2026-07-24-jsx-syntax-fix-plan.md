# JSX Syntax Error Fix in MetricsBentoGrid.tsx Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the JSX syntax error in MetricsBentoGrid.tsx by correcting the malformed template literal in the sparkline visualization style attribute.

**Architecture:** This is a simple syntax fix involving a single line change in a React component. The fix involves correcting a template literal syntax error in a JSX style attribute.

**Tech Stack:** TypeScript, React, JSX

## Global Constraints

- Keep files under 500 lines (already satisfied)
- Validate input at system boundaries (not applicable for this UI fix)
- Do what has been asked; nothing more, nothing less
- NEVER create files unless absolutely necessary (we're only modifying existing file)
- NEVER create documentation files unless explicitly requested (we're only updating existing spec)
- ALWAYS read a file before editing it
- NEVER save working files or tests to root
- Validate input at system boundaries (not applicable)

---

### Task 1: Fix JSX Syntax Error in MetricsBentoGrid.tsx

**Files:**
- Modify: `C:\Users\USER\Desktop\project\crypto\crypto ai\src\app\dashboard\components\MetricsBentoGrid.tsx:409`

**Interfaces:**
- Consumes: None (simple syntax fix)
- Produces: Fixed JSX syntax that compiles correctly

- [ ] **Step 1: Read the file to locate the exact syntax error**

```bash
cat "C:\Users\USER\Desktop\project\crypto\crypto ai\src\app\dashboard\components\MetricsBentoGrid.tsx" | grep -n "style.*height"
```

- [ ] **Step 2: Write the fix by correcting the template literal**

Change line 409 from:
```jsx
style={{ height: `${h}%" }}
```
to:
```jsx
style={{ height: `${h}%` }}
```

- [ ] **Step 3: Verify the fix by viewing the corrected code**

```bash
cat "C:\Users\USER\Desktop\project\crypto\crypto ai\src\app\dashboard\components\MetricsBentoGrid.tsx" | grep -A2 -B2 "style.*height"
```

- [ ] **Step 4: Commit the fix**

```bash
git add "C:\Users\USER\Desktop\project\crypto\crypto ai\src\app\dashboard\components\MetricsBentoGrid.tsx"
git commit -m "fix: correct JSX syntax error in MetricsBentoGrid.tsx sparkline style attribute"
```

### Task 2: Verify Build Success

**Files:**
- None (verification task)

**Interfaces:**
- Consumes: The fixed MetricsBentoGrid.tsx file
- Produces: Successful build output

- [ ] **Step 1: Run the build command to verify the fix works**

```bash
npm run build
```

- [ ] **Step 2: Capture and verify the build output shows success**

Expected output should show successful compilation without JSX parsing errors.

- [ ] **Step 3: Commit any build-related files if needed (though typically no commit needed for build verification)**

```bash
# Only if build generates files that need committing
git add .
git commit -m "chore: verify build succeeds after JSX fix"
```