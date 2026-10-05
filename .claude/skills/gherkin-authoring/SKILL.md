---
name: gherkin-authoring
description: "Load this skill when writing or reviewing Gherkin .feature files, discussing Cucumber syntax, or structuring behavior scenarios. Covers the complete Gherkin specification (Feature, Scenario, Scenario Outline, Background, Rule), step keywords (Given/When/Then/And/But), data tables, examples, tags, doc strings, comments, and anti-patterns. Applies to any Gherkin work, not just appget."
allowed-tools: Read, Glob, Grep
---

# Gherkin Authoring — Standard Syntax and Best Practices

Gherkin is the plain-text language used by Cucumber and BDD frameworks to describe software behavior. This skill covers the full Gherkin specification and writing best practices.

**Note**: appget uses a subset of Gherkin (Scenario only, with custom tags and a specific DSL). For appget-specific syntax, see the **appget-feature-dsl** skill. This skill provides the broader Gherkin foundation.

---

## Feature File Structure

### Feature Keyword

Every `.feature` file starts with the `Feature` keyword:

```gherkin
Feature: User authentication
  Users should be able to log in with valid credentials
  and receive appropriate error messages for invalid ones.

  Scenario: Successful login
    ...
```

The description (indented text after `Feature:`) is free-form documentation — the parser ignores it but humans read it.

### Rule Keyword (Gherkin 6+)

Groups scenarios under a named business rule within a feature:

```gherkin
Feature: Account management

  Rule: Users must have unique email addresses
    Scenario: Registration with new email succeeds
      ...
    Scenario: Registration with existing email fails
      ...

  Rule: Passwords must meet complexity requirements
    Scenario: Password with all requirements passes
      ...
```

### Background

Shared setup steps that run before every scenario in the feature (or within a Rule):

```gherkin
Feature: Shopping cart

  Background:
    Given a registered user "Alice"
    And an empty shopping cart

  Scenario: Add item to cart
    When Alice adds "Widget" to the cart
    Then the cart contains 1 item

  Scenario: Remove item from cart
    Given the cart contains "Widget"
    When Alice removes "Widget" from the cart
    Then the cart is empty
```

**Best practice**: Keep Background short (1-3 steps). If it grows, consider splitting the feature.

---

## Step Keywords

### Given — Precondition / Context

Describes the initial state before the action. Use past tense or passive voice:

```gherkin
Given the user is logged in
Given there are 3 items in the database
Given the system is in maintenance mode
```

### When — Action / Event

Describes the action that triggers the behavior. Use present tense:

```gherkin
When the user clicks "Submit"
When the payment is processed
When 24 hours have elapsed
```

### Then — Observable Outcome

Describes the expected result. Use "should", "is", "has", or present tense:

```gherkin
Then the user sees a confirmation message
Then the order status is "CONFIRMED"
Then the account balance is $50.00
```

### And / But — Additional Steps

Continue the previous keyword type:

```gherkin
Given the user is logged in
  And the user has admin permissions
When the user deletes a record
Then the record is removed
  But the audit log contains the deletion
```

`And` and `But` are interchangeable with their preceding keyword — they exist for readability.

### Step Independence

Each step should be independently meaningful. Avoid steps that only make sense with context from other steps.

---

## Data Tables

Structured data passed to a step as rows and columns:

```gherkin
Given the following users exist:
  | name    | email              | role    |
  | Alice   | alice@example.com  | admin   |
  | Bob     | bob@example.com    | user    |
  | Charlie | charlie@example.com| viewer  |
```

**Header row**: First row is treated as column headers by most frameworks.
**Cell values**: All cells are strings — type conversion is handled in step definitions.

### Single-Column Lists

```gherkin
When the user selects the following tags:
  | technology |
  | science    |
  | art        |
```

### Diff Tables (Assertion)

```gherkin
Then the search results should contain:
  | title        | author  |
  | Clean Code   | Martin  |
  | Refactoring  | Fowler  |
```

---

## Doc Strings

Multi-line text arguments enclosed in triple quotes:

```gherkin
Given the user submits the following JSON:
  """json
  {
    "name": "Widget",
    "price": 29.99,
    "category": "electronics"
  }
  """
```

The optional media type hint (`json`, `xml`, `yaml`) after the opening `"""` helps both humans and tools understand the content.

---

## Scenario Outline and Examples

Parameterized scenarios that run once per row in the Examples table:

```gherkin
Scenario Outline: Login with various credentials
  Given the user enters username "<username>"
  And the user enters password "<password>"
  When the user clicks login
  Then the result is "<outcome>"

  Examples: Valid credentials
    | username | password   | outcome |
    | alice    | correct123 | success |
    | bob      | valid456   | success |

  Examples: Invalid credentials
    | username | password | outcome      |
    | alice    | wrong    | access denied|
    | unknown  | any      | user not found|
```

**Angle brackets** (`<username>`) mark placeholders replaced by Example values.
**Multiple Examples blocks** can be tagged independently for filtering.

---

## Tags

### Syntax

Tags are prefixed with `@` and placed on the line before the element they annotate:

```gherkin
@smoke @regression
Feature: User authentication

  @wip
  Scenario: Login with 2FA
    ...
```

### Tag Inheritance

Tags on a `Feature` are inherited by all `Rule`, `Scenario`, and `Scenario Outline` elements within it.

### Common Tag Patterns

| Tag | Purpose |
|-----|---------|
| `@smoke` | Quick sanity tests for CI |
| `@regression` | Full regression suite |
| `@wip` | Work in progress, skip in CI |
| `@slow` | Long-running tests, separate job |
| `@manual` | Requires manual testing |
| `@api` / `@ui` | Test layer separation |
| `@critical` | Must-pass for release |

### Tag Expressions (Filtering)

Most Cucumber implementations support boolean tag expressions for selective execution:

```
@smoke and not @wip           # Smoke tests that aren't WIP
@api or @integration           # API or integration tests
@regression and @critical      # Critical regression tests
```

---

## Comments

Lines starting with `#` are comments:

```gherkin
# This feature covers the checkout flow
Feature: Checkout

  # TODO: Add scenario for coupon codes
  Scenario: Basic checkout
    ...
```

Comments are for humans only — the parser ignores them.

---

## Writing Effective Scenarios

### One Scenario = One Behavior

Each scenario should test exactly one behavior or business rule. If a scenario has more than 5-7 steps, it probably covers too much.

```gherkin
# GOOD: One behavior
Scenario: Expired coupon is rejected
  Given a coupon "SAVE10" that expired yesterday
  When the user applies the coupon
  Then the coupon is rejected with message "Coupon has expired"

# BAD: Multiple behaviors in one scenario
Scenario: Coupon handling
  Given various coupons exist
  When the user applies an expired coupon
  Then it is rejected
  When the user applies a valid coupon
  Then it is accepted
  When the user applies a used coupon
  Then it is rejected
```

### Declarative Over Imperative

Describe WHAT happens, not HOW:

```gherkin
# GOOD: Declarative (business language)
Scenario: User registers for an account
  Given a new user with email "alice@example.com"
  When the user completes registration
  Then the account is created
  And a welcome email is sent

# BAD: Imperative (UI implementation details)
Scenario: User registers for an account
  When the user navigates to /register
  And the user fills in "email" with "alice@example.com"
  And the user fills in "password" with "secret123"
  And the user clicks the "Register" button
  Then the page shows "Registration complete"
```

### Business Language, Not Technical

Scenarios should be readable by non-technical stakeholders:

```gherkin
# GOOD
When the order total exceeds the fraud threshold

# BAD
When the order_total column value > FRAUD_THRESHOLD_ENV_VAR
```

### Avoid Incidental Details

Only include information relevant to the behavior being tested:

```gherkin
# GOOD: Only relevant details
Given a premium user
When the user requests a refund for a recent order
Then the refund is processed immediately

# BAD: Irrelevant details
Given a user "Alice" with email "alice@example.com" created on 2024-01-15
  And the user has subscription plan "Premium" costing $49.99/month
  And the user's payment method is Visa ending in 4242
When the user requests a refund for order #12345 placed on 2024-02-01
Then the refund of $29.99 is processed to Visa ending in 4242
```

---

## Anti-Patterns

### The Giant Scenario

**Problem**: Scenario with 15+ steps testing multiple behaviors.
**Fix**: Split into multiple focused scenarios. Use Background for shared setup.

### The Incidental Detail

**Problem**: Scenarios full of irrelevant data that obscure the behavior.
**Fix**: Only include data that directly affects the outcome. Use meaningful defaults.

### The Coupled Scenarios

**Problem**: Scenarios that depend on execution order or shared state.
**Fix**: Each scenario must be independently runnable. Reset state in Background or Given steps.

### The Implementation Leak

**Problem**: Scenarios reference CSS selectors, API endpoints, database columns.
**Fix**: Use business language. Let step definitions handle implementation mapping.

### The Snowplow

**Problem**: One enormous scenario that covers the entire workflow.
**Fix**: Break into focused scenarios per behavior. Use Scenario Outline for variations.

### The Imperative Style

**Problem**: Step-by-step UI instructions instead of business behaviors.
**Fix**: Abstract UI interactions into declarative steps (e.g., "When the user logs in" instead of "When the user clicks the login button").

### The Copy-Paste Scenario

**Problem**: Nearly identical scenarios with minor variations.
**Fix**: Use Scenario Outline with Examples table.

---

## File Organization

### One Feature Per File

Each `.feature` file should cover one feature or domain area. Name the file to match:

```
features/
├── authentication.feature
├── shopping_cart.feature
├── checkout.feature
├── user_profile.feature
└── admin_dashboard.feature
```

### Grouping by Domain

For larger projects, organize by domain subdirectory:

```
features/
├── auth/
│   ├── login.feature
│   └── registration.feature
├── commerce/
│   ├── cart.feature
│   └── checkout.feature
└── admin/
    └── user_management.feature
```

### Feature Description as Documentation

The feature description block is your living documentation. Use it to explain the business context:

```gherkin
Feature: Fraud detection
  The system monitors transactions for suspicious patterns.
  When fraud is detected, the transaction is held for review
  and the customer is notified. This protects both the business
  and legitimate customers from unauthorized charges.
```

---

## Naming Conventions

### Feature Names

Use the business capability or domain area:
- `User Authentication` (not `Login Page Tests`)
- `Order Processing` (not `OrderController Integration`)

### Scenario Names

Describe the specific behavior being verified:
- `Expired coupon is rejected at checkout` (not `Test coupon validation`)
- `Premium user gets free shipping on orders over $50` (not `Test shipping rules`)

### Tag Names

Use lowercase with hyphens or underscores. Be consistent across the project:
- `@smoke`, `@regression`, `@wip`
- `@domain:auth`, `@priority:high`

---

## appget Compatibility Note

appget currently uses only these Gherkin features:
- `Feature` keyword with `@domain` tag
- `Scenario` keyword with `@target`, `@rule`, `@blocking`, `@view` tags
- `Given` (metadata requirements only), `When` (conditions), `Then`/`But otherwise` (outcomes)
- Data tables (for compound conditions and metadata requirements)

Not currently used by appget: `Scenario Outline`, `Background`, `Rule` keyword, `Doc Strings`, `Examples` tables. These are standard Gherkin features that could be adopted if the appget DSL expands.
