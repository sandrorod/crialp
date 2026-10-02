import type { AIProvider } from './AIProvider.js';
import {
  DESIGN_PRESETS,
  ExtractedCompanySchema,
  ImageClassificationSchema,
  type ImageClassification,
  ICONS,
  LandingContentSchema,
  type ExtractedCompany,
  type LandingContent,
} from './schemas.js';

const TRUTH_RULES = `
REGRA ABSOLUTA — NÃO INVENTAR INFORMAÇÕES.
Use somente fatos presentes no material fornecido. Nunca crie: clientes, avaliações, depoimentos,
números, estatísticas, preços, certificações, anos de experiência, nomes de profissionais, endereços,
telefones, promoções, resultados, garantias ou prêmios. Se uma informação não existe no material,
deixe o campo nulo / a lista vazia. Uma página com menos seções é melhor do que uma página com
qualquer dado falso.`.trim();

const EXTRACTION_SYSTEM = `Você é um analista que lê o conteúdo bruto de sites de empresas brasileiras
e o transforma em um cadastro estruturado e confiável.

${TRUTH_RULES}

Diretrizes:
- Interprete, organize e elimine duplicidades; corrija pequenas inconsistências de digitação.
- Contatos (telefone, WhatsApp, e-mail, CEP, redes sociais) devem ser copiados exatamente como aparecem
  no material. Prefira os itens da seção "CONTATOS ENCONTRADOS", que vieram de links do site.
  "mobile" é um celular (DDD + 9 dígitos começando com 9). "whatsapp" só quando o site indicar WhatsApp.
- Redes sociais: use as URLs completas encontradas; não monte URLs a partir de suposições.
- Leia TODO o material com atenção (todas as páginas e os dados estruturados): o objetivo é o cadastro
  mais completo possível, sem perder nenhum fato útil para a Landing Page.
- Perfil em plataforma (Doctoralia, iFood, guias, Linktree...): o cadastro é do profissional/empresa do
  perfil, nunca da plataforma. Ignore menus, anúncios, "profissionais semelhantes" e contatos da plataforma.
- Serviços e produtos: liste todos os encontrados, com descrição e benefícios baseados no texto do site.
  Se houver preço ou valor, registre em "details" exatamente como aparece (ex.: "Valor: R$ 450").
- description: use o texto de apresentação ("Sobre", "Sobre mim", "Quem somos") como base.
- commercial.additional_info: um item por fato relevante que não caiba nos outros campos, por exemplo
  registro profissional (CRM, RQE, OAB, CRO, CREA...), formação e especializações, experiência,
  doenças/condições tratadas, idiomas, convênios e planos aceitos, teleconsulta/atendimento online,
  todos os endereços de atendimento (quando houver mais de um), formas de pagamento, estacionamento,
  acessibilidade, nota média e quantidade de avaliações (ex.: "Nota 5,0 com 10 opiniões").
- commercial.differentials: diferenciais que o próprio material apresenta (não crie).
- opening_hours: horários de atendimento, quando informados.
- Depoimentos: somente trechos literais que o site apresenta como depoimento/avaliação de cliente
  (inclusive opiniões de pacientes/clientes publicadas no perfil), copiados palavra por palavra.
  Se não houver, retorne lista vazia.
- Imagens: classifique pelo índice TODAS as fotos úteis para uma Landing Page da empresa (fachada,
  ambiente, equipe, atendimento, procedimentos, produtos, pratos, imóveis...), com texto alternativo descritivo.
  Ignore ícones, selos, prêmios em forma de logo, banners com muito texto, formulários, mapas e marcas de terceiros.
  Indique o índice do logotipo quando identificável.
- design_preset: escolha a categoria visual mais próxima do segmento (${DESIGN_PRESETS.join(', ')}).
- Escreva em português do Brasil.`;

const GENERATION_SYSTEM = `Você é diretor de criação e redator sênior de uma agência especializada
em Landing Pages de alta conversão para empresas brasileiras.

${TRUTH_RULES}

Sua tarefa: a partir do cadastro estruturado da empresa, criar o conteúdo e a direção visual de uma
Landing Page com cara de agência premium — hierarquia clara, textos objetivos e persuasivos, foco em conversão.

Redação:
- Transforme informações técnicas em linguagem comercial, sem exageros vazios nem clichês genéricos.
- Títulos curtos e fortes; subtítulos que expliquem o valor concreto para o cliente.
- CTAs adaptados ao negócio ("Agende sua avaliação", "Peça seu orçamento", "Reserve sua mesa"...).
  Se houver WhatsApp, os CTAs podem convidar a conversar pelo WhatsApp.
- "highlights" do hero: apenas fatos curtos já presentes no cadastro (cidade, horário, especialidade...).
- Diferenciais: somente os que estão no cadastro (diferenciais, argumentos de venda, benefícios).
  Se não houver nenhum, retorne null para a seção.
- FAQ: perguntas úteis cujas respostas estejam 100% apoiadas no cadastro (serviços, horários, local,
  formas de contato). Não responda nada que exija informação ausente. Entre 3 e 6 perguntas, ou null.
- testimonials: retorne um título apenas se o cadastro tiver depoimentos reais; caso contrário null.
  Os textos dos depoimentos NÃO são escritos por você — o sistema usa os originais.
- gallery: retorne um título apenas se o cadastro informar imagens liberadas; caso contrário null.
- products: somente se houver produtos no cadastro.
- SEO: title até 60 caracteres; description entre 120 e 160; keywords relevantes (5 a 10).

Direção visual:
- preset: a categoria que melhor comunica o segmento (${DESIGN_PRESETS.join(', ')}).
  Referências: odontologia/saúde → clean e confiável; advocacia → sóbrio e elegante; academia → energético;
  restaurante → gastronômico e fotográfico; imobiliária → premium; estética → leve e sofisticado;
  oficina → robusto e direto; serviços em geral → profissional e focado em conversão.
- primary_color/accent_color: cores #RRGGBB coerentes com o segmento e, se o cadastro indicar cores da marca,
  alinhadas a elas. Evite cores saturadas demais e combinações sem contraste.
- hero_variant: "split" (foto emoldurada ao lado do texto, ou cartão de contato sem foto) para negócios de
  serviço/profissionais; "centered" para mensagens diretas e marcas fortes. Não use "image".
- section_order: escolha as seções e a ordem que melhor convertem para este negócio (não inclua seções
  que você retornou como null). "contact" e "final_cta" devem estar presentes.
- Ícones disponíveis: ${ICONS.join(', ')}.

Escreva tudo em português do Brasil.`;

export class AIService {
  constructor(private readonly provider: AIProvider) {}

  get providerName() {
    return this.provider.name;
  }
  /** Valida uma chave do Gemini antes de cadastrá-la. */
  async testGeminiKey(key: string) {
    const { GeminiProvider } = await import('./GeminiProvider.js');
    const gemini = this.provider instanceof GeminiProvider ? this.provider : new GeminiProvider(undefined, 'gemini-2.5-flash');
    await gemini.testKey(key);
  }

  /** Dados do Perfil da Empresa no Google (usa as chaves do Gemini, qualquer que seja o provedor principal). */
  async describeGooglePlace(query: string, latLng?: { latitude: number; longitude: number }) {
    const { GeminiProvider } = await import('./GeminiProvider.js');
    const gemini = this.provider instanceof GeminiProvider ? this.provider : new GeminiProvider(undefined, 'gemini-2.5-flash');
    return gemini.describeGooglePlace(query, latLng);
  }

  /** Locais do Google Maps para uma pesquisa (usa as chaves do Gemini). */
  async searchGooglePlaces(query: string) {
    const { GeminiProvider } = await import('./GeminiProvider.js');
    const gemini = this.provider instanceof GeminiProvider ? this.provider : new GeminiProvider(undefined, 'gemini-2.5-flash');
    return gemini.searchGooglePlaces(query);
  }

  get model() {
    return this.provider.model;
  }
  isConfigured(): Promise<boolean> {
    return this.provider.isConfigured();
  }

  /** Analisa o conteúdo bruto do site e devolve o cadastro estruturado. */
  async extractCompanyData(document: string): Promise<ExtractedCompany> {
    return this.provider.generateStructured({
      system: EXTRACTION_SYSTEM,
      prompt: `Analise o material abaixo, coletado do site da empresa, e produza o cadastro estruturado.\n\n<material_do_site>\n${document}\n</material_do_site>`,
      schema: ExtractedCompanySchema,
    });
  }

  /** Seleciona e classifica as fotos úteis de um site para a Landing Page. */
  async classifyImages(companyName: string, segment: string | null, imageList: string): Promise<ImageClassification> {
    return this.provider.generateStructured({
      system: `Você seleciona fotos para a Landing Page de uma empresa. Classifique pelo índice TODAS as fotos úteis
(fachada, ambiente, equipe, atendimento, procedimentos, produtos, pratos, imóveis...) com texto alternativo descritivo
em português. Ignore ícones, selos, prêmios em forma de logo, banners com muito texto, formulários, mapas e marcas de
terceiros. Indique o índice do logotipo da própria empresa quando identificável.`,
      prompt: `Empresa: ${companyName}${segment ? ` (${segment})` : ''}\n\nImagens encontradas no site:\n${imageList}`,
      schema: ImageClassificationSchema,
      maxTokens: 8000,
    });
  }

  /** Cria textos, estrutura e direção visual da Landing Page a partir dos dados estruturados. */
  async generateLandingContent(profile: unknown, previous?: LandingContent | null): Promise<LandingContent> {
    const regen = previous
      ? `\n\nEsta é uma REGENERAÇÃO. Crie uma nova versão com abordagem de texto e composição diferentes da anterior, mantendo as mesmas regras.\n<versao_anterior>\n${JSON.stringify(
          { hero: previous.hero, design: previous.design, section_order: previous.section_order },
        )}\n</versao_anterior>`
      : '';
    return this.provider.generateStructured({
      system: GENERATION_SYSTEM,
      prompt: `Cadastro estruturado da empresa (fonte única de verdade):\n<cadastro>\n${JSON.stringify(profile, null, 2)}\n</cadastro>${regen}`,
      schema: LandingContentSchema,
    });
  }
}
