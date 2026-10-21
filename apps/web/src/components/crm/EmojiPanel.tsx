import EmojiPicker, { Categories, EmojiStyle, SuggestionMode, type EmojiClickData } from 'emoji-picker-react';
import ptEmojis from 'emoji-picker-react/dist/data/emojis-pt';

// Mesmas categorias (e ordem) do WhatsApp, com nomes em português
const CATEGORIES = [
  { category: Categories.SUGGESTED, name: 'Usados recentemente' },
  { category: Categories.SMILEYS_PEOPLE, name: 'Smileys e pessoas' },
  { category: Categories.ANIMALS_NATURE, name: 'Animais e natureza' },
  { category: Categories.FOOD_DRINK, name: 'Comidas e bebidas' },
  { category: Categories.ACTIVITIES, name: 'Atividades' },
  { category: Categories.TRAVEL_PLACES, name: 'Viagens e lugares' },
  { category: Categories.OBJECTS, name: 'Objetos' },
  { category: Categories.SYMBOLS, name: 'Símbolos' },
  { category: Categories.FLAGS, name: 'Bandeiras' },
];

/** Seletor de emojis (carregado só quando aberto): emojis do próprio sistema, como no WhatsApp. */
export default function EmojiPanel({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <EmojiPicker
      onEmojiClick={(e: EmojiClickData) => onPick(e.emoji)}
      emojiStyle={EmojiStyle.NATIVE}
      emojiData={ptEmojis}
      categories={CATEGORIES}
      suggestedEmojisMode={SuggestionMode.RECENT}
      searchPlaceHolder="Pesquisar emoji"
      previewConfig={{ showPreview: false }}
      lazyLoadEmojis
      width={340}
      height={380}
    />
  );
}
