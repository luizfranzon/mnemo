import { actions, useApp } from '../store/app'

export function GitMissing() {
  const message = useApp((s) => (s.git.phase === 'missing' ? s.git.message : ''))
  return (
    <div className="center">
      <div className="card">
        <h1>Git não encontrado</h1>
        <p>{message}</p>
        <p className="muted">
          O Mnemo usa o git instalado no sistema (versão 2.38 ou mais nova).
          <br />
          Windows: <code>winget install --id Git.Git</code> ou baixe em git-scm.com.
          <br />
          Debian/Ubuntu: <code>sudo apt install git</code> · Fedora: <code>sudo dnf install git</code>
        </p>
        <button className="primary" onClick={() => void actions.checkGit()}>
          Verificar de novo
        </button>
      </div>
    </div>
  )
}
