<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- Unapproved database changes are staged in supabase/pending/ (never supabase/migrations/) and exercised only by the disposable harness with FV0143_INCLUDE_PENDING=1; this keeps production migrations owner-gated.
- Greek scientific handbooks in data/scientific stay byte-identical; English display text lives in sibling *.en*.json layers joined by ID via src/domain/scientific-localization (keeps source traceability).
