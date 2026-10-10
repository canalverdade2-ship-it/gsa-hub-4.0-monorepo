from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace(path: str, old: str, new: str) -> None:
    target = ROOT / path
    content = target.read_text(encoding="utf-8")
    if old in content:
        target.write_text(content.replace(old, new), encoding="utf-8")
    elif "<<<<<<<" in content or ">>>>>>>" in content:
        raise RuntimeError(f"Conflito não reconhecido em {path}")


replace(
    "src/components/admin/AffiliateAdminModule.tsx",
    """<<<<<<< HEAD
function ProgramEditor({ program, onSaved }: { program: AffiliateProgram; onSaved: () => Promise<void> | void }) {
=======
function ProgramEditor({ program, onSaved }: { key?: string; program: AffiliateProgram; onSaved: () => Promise<void> }) {
>>>>>>> f45124e36db6ae5a7a3644728d56972b9db88b85""",
    """function ProgramEditor({ program, onSaved }: { program: AffiliateProgram; onSaved: () => Promise<void> }) {""",
)

replace(
    "src/components/public/AffiliatePublicPage.tsx",
    """<<<<<<< HEAD
    async function fetchPrograms() {
=======
    void (async () => {
>>>>>>> f45124e36db6ae5a7a3644728d56972b9db88b85""",
    """    async function fetchPrograms() {""",
)
replace(
    "src/components/public/AffiliatePublicPage.tsx",
    """<<<<<<< HEAD
        // ignore
      }
    }

    fetchPrograms();
=======
        // Mantém os programas de fallback quando a RPC pública estiver indisponível.
      }
    })();
>>>>>>> f45124e36db6ae5a7a3644728d56972b9db88b85""",
    """        // Mantém os programas de fallback quando a RPC pública estiver indisponível.
      }
    }

    void fetchPrograms();""",
)

replace(
    "src/components/public/final/PublicFooter.tsx",
    """<<<<<<< HEAD
        <nav aria-label="Publicidade">
=======
        <nav aria-label="Links de publicidade">
>>>>>>> f45124e36db6ae5a7a3644728d56972b9db88b85""",
    """        <nav aria-label="Links de publicidade">""",
)

for path in [
    "src/components/admin/AffiliateAdminModule.tsx",
    "src/components/public/AffiliatePublicPage.tsx",
    "src/components/public/final/PublicFooter.tsx",
]:
    content = (ROOT / path).read_text(encoding="utf-8")
    if any(marker in content for marker in ("<<<<<<<", "=======", ">>>>>>>")):
        raise RuntimeError(f"Marcador de conflito restante em {path}")

print("Conflitos ativos resolvidos com sucesso.")
