---
name: Protected project render verification
description: Why parent-screen binding checks matter even when child tests and transpilation pass
---

Check the protected parent render path, not only child components or syntax
transformation, when changing project-page JSX.

**Why:** A production project page crashed despite passing child tests and
transpilation: a conditional child's prop expression referenced an undeclared
value. JSX prop expressions are evaluated by the parent even when the enclosing
tab is inactive. The signed-out preview could not exercise that branch.

**How to apply:** Include identifier-binding checks or an authenticated parent
render test for changed JSX. A focused binding check is useful when full-project
type checking is too expensive, but is not a substitute for full type checking
or live signed-in verification. State that limitation explicitly.
