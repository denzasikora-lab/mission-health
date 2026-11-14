# Mission Health Pages address

This publication branch sends visitors to the production application at https://mission-health-bug-busters.vercel.app/.

The application source and Vercel deployment remain on `main`. The redirect keeps URL query parameters and the fragment when JavaScript is enabled. The visible link and HTML refresh provide fallback navigation.

Only public redirect files belong on this branch. Runtime credentials, application storage and medical records must stay outside it.
