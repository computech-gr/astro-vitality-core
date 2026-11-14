# Mission access rules

- P72 homepage role access: full mapped account emails live only in src/lib/p72-role-access.server.ts (the browser shows masked labels and compares nothing itself); only a signed-in mapped account is routed to its console, signed-out/demo visitors keep the P69 one-click demo, and other accounts are never switched silently, because routing must never become identity transfer.
