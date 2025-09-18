# Expense Monitor Web Application

A lightweight browser-based personal finance companion for tracking salary, expenses, loans/EMIs and generating monthly to annual insights. All data is stored locally in the browser using `localStorage`, making it perfect for quick demos and academic presentations.

## Features

- **Secure onboarding** – email-style username/password login & signup with simulated biometric toggle.
- **Monthly dashboard** – configure salary (single month, carry forward or custom range), view expenses, EMIs, savings, utilisation status and a financial health score with personalised guidance.
- **Expense management** – manually add categorised spends, upload CSV statements from banks/credit cards and export filtered transactions back to CSV.
- **Loan & EMI tracking** – capture repayment schedules, due dates and close loans when finished.
- **Reports & insights** – build range-based summaries (monthly to annual) with category breakdowns and comparative tables for salary vs. expenses vs. EMIs.

## Getting started

1. Open `index.html` in any modern browser (Chrome, Edge, Firefox or Safari).
2. Create a new account from the signup tab.
3. Add salary, expenses and EMIs to explore dashboards, budgets and reports.

> Tip: Because everything runs locally, you can duplicate the tab to act as different users without setting up a backend.

## Development notes

- Built with vanilla HTML, CSS and JavaScript – no build tooling required.
- CSV uploads expect headers containing `date`, `description` and `amount`. Additional `account` columns are optional.
- Financial scoring is a heuristic to help highlight overspending or heavy EMI exposure.

Feel free to adapt the UI or plug in a backend/visualisation library to extend the project for your final submission.
