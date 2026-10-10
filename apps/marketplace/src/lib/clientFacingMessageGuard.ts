const CUSTOMER_MESSAGE_REPLACEMENTS = new Map<string, string>([
  [
    'Não foi possível consultar as opções agora. Verifique se as migrações dos módulos foram aplicadas.',
    'Não foi possível carregar as opções de seguros no momento. Tente novamente em instantes ou solicite uma cotação personalizada.',
  ],
]);

function replaceTechnicalMessages(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const currentText = node.textContent;
    if (!currentText) return;

    for (const [technicalMessage, customerMessage] of CUSTOMER_MESSAGE_REPLACEMENTS) {
      if (currentText.includes(technicalMessage)) {
        node.textContent = currentText.replace(technicalMessage, customerMessage);
        return;
      }
    }

    return;
  }

  node.childNodes.forEach(replaceTechnicalMessages);
}

if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const root = document.documentElement;
  replaceTechnicalMessages(root);

  const observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        replaceTechnicalMessages(mutation.target);
        continue;
      }

      mutation.addedNodes.forEach(replaceTechnicalMessages);
    }
  });

  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}
