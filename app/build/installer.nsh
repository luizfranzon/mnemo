; Oferece instalar o git pelo winget quando ele não está no PATH. Recusar não impede a instalação do Mnemo.
!macro customInstall
  nsExec::ExecToStack 'cmd /c git --version'
  Pop $0
  Pop $1
  ${If} $0 != 0
    MessageBox MB_YESNO|MB_ICONQUESTION "O Mnemo precisa do git, que não foi encontrado. Instalar agora com o winget?" /SD IDNO IDNO gitDone
    nsExec::ExecToLog 'cmd /c winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements'
    Pop $0
    ${If} $0 != 0
      MessageBox MB_OK|MB_ICONEXCLAMATION "Não foi possível instalar o git pelo winget. Baixe em https://git-scm.com/download/win." /SD IDOK
    ${EndIf}
  ${EndIf}
  gitDone:
!macroend
