// Ready-made word packs — official, curated vocabulary the user can add on
// top of their own words with one tap. Unlike the old seed.js mechanism
// these are never auto-merged: a pack only reaches localStorage when the
// user explicitly picks it in the "Add a pack" flow (js/screens/packs.js).
//
// Same "term | translation | pronunciation" format as "+ Add words" and the
// old seed lessons, parsed with the same parseWordLines().
import { parseWordLines } from './wordsformat.js';

const RAW = {
  'biz-meetings': {
    name: 'Business Meetings & Correspondence',
    text: `agenda | повестка дня | /əˈdʒendə/
to reschedule | перенести (встречу) | /ˌriːˈʃedjuːl/
to follow up | связаться повторно / уточнить | /ˈfɒləʊ ʌp/
minutes (of a meeting) | протокол встречи | /ˈmɪnɪts/
to dial in | подключиться (по телефону/видео) | /ˈdaɪəl ɪn/
quorum | кворум | /ˈkwɔːrəm/
to table (an issue) | отложить (вопрос) | /ˈteɪbl/
stakeholder | заинтересованная сторона | /ˈsteɪkhəʊldə/
to circulate (a document) | разослать (документ) | /ˈsɜːkjəleɪt/
deadline | крайний срок | /ˈdedlaɪn/
to touch base | связаться, синхронизироваться | /tʌtʃ beɪs/
action item | пункт для выполнения | /ˈækʃn ˈaɪtəm/
to postpone | отложить | /pəˈspəʊn/
RSVP | подтвердить участие | /ˌɑːr es viː ˈpiː/
to CC someone | поставить в копию | /ˌsiː ˈsiː/
attachment | вложение | /əˈtætʃmənt/
to loop someone in | подключить кого-то к переписке | /luːp ɪn/
draft | черновик | /drɑːft/
to finalize | утвердить окончательно | /ˈfaɪnəlaɪz/
on behalf of | от имени | /ɒn bɪˈhɑːf əv/
kick-off meeting | стартовая встреча | /ˈkɪk ɒf ˈmiːtɪŋ/
to escalate | эскалировать (проблему) | /ˈeskəleɪt/
venue | место проведения | /ˈvenjuː/
to confirm attendance | подтвердить присутствие | /kənˈfɜːm əˈtendəns/
briefing | брифинг, короткое совещание | /ˈbriːfɪŋ/
to liaise with | взаимодействовать с | /liˈeɪz wɪð/
follow-up email | письмо-напоминание после встречи | /ˈfɒləʊ ʌp ˈiːmeɪl/
to reconvene | возобновить встречу (после перерыва) | /ˌriːkənˈviːn/
conflicting schedule | пересечение по времени в расписании | /kənˈflɪktɪŋ ˈʃedjuːl/
to wrap up | подытожить, завершить | /ræp ʌp/`,
  },
  'finance-investing': {
    name: 'Finance & Investing',
    text: `market outlook | прогноз по рынку / рыночные перспективы | /ˈmɑːkɪt ˈaʊtlʊk/
investor sentiment | настроения инвесторов | /ɪnˈvestə ˈsentɪmənt/
risk appetite | склонность к риску / готовность принимать риск | /rɪsk ˈæpɪtaɪt/
downside risk | риск снижения / риск негативного сценария | /ˈdaʊnsaɪd rɪsk/
upside potential | потенциал роста | /ˈʌpsaɪd pəˈtenʃl/
elevated valuations | высокие / повышенные оценки стоимости активов | /ˈelɪveɪtɪd ˌvæljuˈeɪʃnz/
market volatility | волатильность рынка | /ˈmɑːkɪt ˌvɒləˈtɪləti/
economic resilience | устойчивость экономики | /ˌiːkəˈnɒmɪk rɪˈzɪliəns/
rate-cutting cycle | цикл снижения процентных ставок | /reɪt ˈkʌtɪŋ ˈsaɪkl/
earnings growth | рост прибыли компаний | /ˈɜːnɪŋz ɡrəʊθ/
gain exposure to | получить экспозицию к | /ɡeɪn ɪkˈspəʊʒə tə/
remain overweight | сохранять повышенную долю актива в портфеле | /rɪˈmeɪn ˌəʊvəˈweɪt/
take a defensive stance | занять защитную инвестиционную позицию | /teɪk ə dɪˈfensɪv stɑːns/
price in rate cuts | закладывать снижение ставок в текущие цены | /praɪs ɪn reɪt kʌts/
weigh on growth | сдерживать рост | /weɪ ɒn ɡrəʊθ/
a supportive backdrop | благоприятный фон | /ə səˈpɔːtɪv ˈbækdrɒp/
asset allocation | распределение активов | /ˈæset ˌæləˈkeɪʃn/
risk-adjusted returns | доходность с поправкой на риск | /rɪsk əˈdʒʌstɪd rɪˈtɜːnz/
market headwinds | негативные факторы для рынка | /ˈmɑːkɪt ˈhedwɪndz/
capital preservation | сохранение капитала | /ˈkæpɪtl ˌprezəˈveɪʃn/
underweight (a position) | держать пониженную долю актива в портфеле | /ˌʌndəˈweɪt/
bull market / bear market | растущий рынок / падающий рынок | /bʊl ˈmɑːkɪt/ /beə ˈmɑːkɪt/
soft landing | мягкая посадка (экономики) | /sɒft ˈlændɪŋ/
inflation is easing | инфляция замедляется | /ɪnˈfleɪʃn ɪz ˈiːzɪŋ/
diversify a portfolio | диверсифицировать портфель | /daɪˈvɜːsɪfaɪ ə pɔːtˈfəʊliəʊ/
tailwind | попутный фактор / позитивный драйвер | /ˈteɪlwɪnd/
flight to quality | бегство в качество | /flaɪt tə ˈkwɒləti/
yield curve | кривая доходности | /jiːld kɜːv/
safe-haven asset | защитный актив | /seɪf ˈheɪvn ˈæset/
to hedge against | хеджироваться от | /hedʒ əˈɡenst/`,
  },
};

/** Curated packs, grouped by language for display — only English for now. */
export const PACK_LANGUAGES = [
  { lang: 'English', packIds: ['biz-meetings', 'finance-investing'] },
];

export const PACKS = Object.entries(RAW).map(([id, p]) => ({
  id,
  name: p.name,
  words: parseWordLines(p.text),
}));

export function getPack(id) {
  return PACKS.find((p) => p.id === id);
}
