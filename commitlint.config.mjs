/**
 * Mensagens de commit no padrão deste repositório: título em português dizendo o que mudou
 * (de preferência "Área: o que mudou"), sem ponto final; corpo opcional, separado por linha em branco.
 * Não segue Conventional Commits (feat:/fix:) — o histórico nunca usou.
 */
export default {
  rules: {
    'header-min-length': [2, 'always', 10],
    'header-max-length': [2, 'always', 250],
    'header-full-stop': [2, 'never', '.'],
    'header-trim': [2, 'always'],
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [1, 'always'],
  },
};
