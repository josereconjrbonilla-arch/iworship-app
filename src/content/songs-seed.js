// Seed hymns — public-domain sample set carried over from the prototype.
// This is the source of truth for two things: (1) the offline/demo data layer
// used whenever Firebase isn't configured yet, and (2) scripts/seed-firestore.mjs,
// which bulk-imports this same list into the real Firestore "songs" collection.
export const SONGS_SEED = [
  {
    id: 'amazing-grace', number: 1, title: 'Amazing Grace', author: 'John Newton, 1779', key: 'G',
    tags: ['No Chorus', 'Testimony'], themes: ['salvation', 'grace', 'assurance'],
    youtube: 'https://www.youtube.com/watch?v=HHx05uZHj1I',
    sections: [
      { type: 'verse', label: 'Verse 1', lines: [
        "[G]Amazing [G7]grace, how [C]sweet the [G]sound",
        "That [G]saved a [Em]wretch like [D]me[D7]",
        "[G]I once was [G7]lost, but [C]now am [G]found",
        "Was [Em]blind, but [D]now I [G]see"
      ]},
      { type: 'verse', label: 'Verse 2', lines: [
        "[G]'Twas grace that [G7]taught my [C]heart to [G]fear",
        "And [G]grace my [Em]fears re[D]lieved[D7]",
        "[G]How precious [G7]did that [C]grace ap[G]pear",
        "The [Em]hour I [D]first be[G]lieved"
      ]},
      { type: 'verse', label: 'Verse 3', lines: [
        "[G]Through many [G7]dangers, [C]toils and [G]snares",
        "I [G]have al[Em]ready [D]come[D7]",
        "[G]'Tis grace hath [G7]brought me [C]safe thus [G]far",
        "And [Em]grace will [D]lead me [G]home"
      ]},
      { type: 'verse', label: 'Verse 4', lines: [
        "[G]When we've been [G7]there ten [C]thousand [G]years",
        "Bright [G]shining [Em]as the [D]sun[D7]",
        "[G]We've no less [G7]days to [C]sing God's [G]praise",
        "Than [Em]when we'd [D]first be[G]gun"
      ]}
    ]
  },
  {
    id: 'blessed-assurance', number: 2, title: 'Blessed Assurance', author: 'Fanny Crosby, 1873', key: 'D',
    tags: ['Chorus Repeats'], themes: ['assurance', 'salvation', 'praise'],
    youtube: 'https://www.youtube.com/watch?v=6GJF1ac37lI',
    sections: [
      { type: 'verse', label: 'Verse 1', lines: [
        "[D]Blessed as[G]surance, [D]Jesus is [A7]mine",
        "[D]Oh, what a [G]foretaste of [A7]glory di[D]vine",
        "[D]Heir of sal[G]vation, [D]purchase of [A7]God",
        "[D]Born of His [G]Spirit, [A7]washed in His [D]blood"
      ]},
      { type: 'chorus', label: 'Chorus', lines: [
        "[D]This is my [G]story, [D]this is my [A7]song",
        "[D]Praising my [G]Savior [A7]all the day [D]long",
        "[D]This is my [G]story, [D]this is my [A7]song",
        "[D]Praising my [G]Savior [A7]all the day [D]long"
      ]},
      { type: 'verse', label: 'Verse 2', lines: [
        "[D]Perfect sub[G]mission, [D]perfect de[A7]light",
        "[D]Visions of [G]rapture now [A7]burst on my [D]sight",
        "[D]Angels des[G]cending [D]bring from a[A7]bove",
        "[D]Echoes of [G]mercy, [A7]whispers of [D]love"
      ]},
      { type: 'chorus', label: 'Chorus', lines: [
        "[D]This is my [G]story, [D]this is my [A7]song",
        "[D]Praising my [G]Savior [A7]all the day [D]long",
        "[D]This is my [G]story, [D]this is my [A7]song",
        "[D]Praising my [G]Savior [A7]all the day [D]long"
      ]},
      { type: 'verse', label: 'Verse 3', lines: [
        "[D]Perfect sub[G]mission, [D]all is at [A7]rest",
        "[D]I in my [G]Savior am [A7]happy and [D]blest",
        "[D]Watching and [G]waiting, [D]looking a[A7]bove",
        "[D]Filled with His [G]goodness, [A7]lost in His [D]love"
      ]},
      { type: 'chorus', label: 'Chorus', lines: [
        "[D]This is my [G]story, [D]this is my [A7]song",
        "[D]Praising my [G]Savior [A7]all the day [D]long",
        "[D]This is my [G]story, [D]this is my [A7]song",
        "[D]Praising my [G]Savior [A7]all the day [D]long"
      ]}
    ]
  },
  {
    id: 'it-is-well', number: 3, title: 'It Is Well With My Soul', author: 'Horatio Spafford, 1873', key: 'C',
    tags: ['Refrain'], themes: ['comfort', 'assurance'],
    youtube: 'https://www.youtube.com/watch?v=i4Mo9pkmd98',
    sections: [
      { type: 'verse', label: 'Verse 1', lines: [
        "[C]When peace like a [G7]river, at[C]tendeth my [F]way[C]",
        "[C]When sorrows like [F]sea billows [C]roll[G7]",
        "What[C]ever my lot, Thou hast [F]taught me to [C]say",
        "It is [G7]well, it is well with my [C]soul"
      ]},
      { type: 'refrain', label: 'Refrain', lines: [
        "It is [F]well ([C]it is well)",
        "With my [G7]soul ([C]with my soul)",
        "It is [F]well, it is [C]well [G7]with my [C]soul"
      ]},
      { type: 'verse', label: 'Verse 2', lines: [
        "[C]Though Satan should [G7]buffet, though [C]trials should [F]come[C]",
        "[C]Let this blest as[F]surance con[C]trol[G7]",
        "That [C]Christ has regarded my [F]helpless es[C]tate",
        "And hath [G7]shed His own blood for my [C]soul"
      ]},
      { type: 'refrain', label: 'Refrain', lines: [
        "It is [F]well ([C]it is well)",
        "With my [G7]soul ([C]with my soul)",
        "It is [F]well, it is [C]well [G7]with my [C]soul"
      ]},
      { type: 'verse', label: 'Verse 3', lines: [
        "[C]My sin, oh the [G7]bliss of this [C]glorious [F]thought[C]",
        "[C]My sin, not in [F]part but the [C]whole[G7]",
        "Is [C]nailed to the cross, and I [F]bear it no [C]more",
        "Praise the [G7]Lord, praise the Lord, O my [C]soul"
      ]},
      { type: 'refrain', label: 'Refrain', lines: [
        "It is [F]well ([C]it is well)",
        "With my [G7]soul ([C]with my soul)",
        "It is [F]well, it is [C]well [G7]with my [C]soul"
      ]},
      { type: 'verse', label: 'Verse 4', lines: [
        "[C]And Lord, haste the [G7]day when my [C]faith shall be [F]sight[C]",
        "[C]The clouds be rolled [F]back as a [C]scroll[G7]",
        "The [C]trump shall resound and the [F]Lord shall de[C]scend",
        "Even [G7]so it is well with my [C]soul"
      ]},
      { type: 'refrain', label: 'Refrain', lines: [
        "It is [F]well ([C]it is well)",
        "With my [G7]soul ([C]with my soul)",
        "It is [F]well, it is [C]well [G7]with my [C]soul"
      ]}
    ]
  },
  {
    id: 'what-a-friend', number: 4, title: 'What a Friend We Have in Jesus', author: 'Joseph Scriven, 1855', key: 'G',
    tags: ['No Chorus'], themes: ['prayer', 'comfort'],
    youtube: 'https://www.youtube.com/watch?v=9mv8SQfJxRk',
    sections: [
      { type: 'verse', label: 'Verse 1', lines: [
        "[G]What a friend we [G7]have in [C]Jesus",
        "[G]All our sins and [D]griefs to [G]bear",
        "[G]What a privilege [G7]to carry",
        "[C]Everything to [G]God in [D]prayer",
        "[G]Oh, what peace we [G7]often [C]forfeit",
        "[G]Oh, what needless [D]pain we [G]bear",
        "[G]All because we [G7]do not carry",
        "[C]Everything to [G]God in [D7]prayer[G]"
      ]},
      { type: 'verse', label: 'Verse 2', lines: [
        "[G]Have we trials and [G7]temp[C]tations",
        "[G]Is there trouble [D]any[G]where",
        "[G]We should never be [G7]discouraged",
        "[C]Take it to the [G]Lord in [D]prayer",
        "[G]Can we find a [G7]friend so [C]faithful",
        "[G]Who will all our [D]sorrows [G]share",
        "[G]Jesus knows our [G7]every weakness",
        "[C]Take it to the [G]Lord in [D7]prayer[G]"
      ]},
      { type: 'verse', label: 'Verse 3', lines: [
        "[G]Are we weak and [G7]heavy [C]laden",
        "[G]Cumbered with a [D]load of [G]care",
        "[G]Precious Savior, [G7]still our refuge",
        "[C]Take it to the [G]Lord in [D]prayer",
        "[G]Do thy friends de[G7]spise, for[C]sake thee",
        "[G]Take it to the [D]Lord in [G]prayer",
        "[G]In His arms He'll [G7]take and shield thee",
        "[C]Thou wilt find a [G]solace [D7]there[G]"
      ]}
    ]
  },
  {
    id: 'when-we-all-get-to-heaven', number: 5, title: 'When We All Get to Heaven', author: 'Eliza E. Hewitt, 1898', key: 'D',
    tags: ['Chorus Repeats'], themes: ['heaven', 'praise'],
    youtube: 'https://www.youtube.com/watch?v=fwierUJpXME',
    sections: [
      { type: 'verse', label: 'Verse 1', lines: [
        "[D]Sing the [G]wondrous [D]love of [A7]Jesus",
        "[D]Sing His [G]mercy [A7]and His [D]grace",
        "[D]In the [G]mansions [D]bright and [A7]blessed",
        "[D]He'll pre[G]pare for [A7]us a [D]place"
      ]},
      { type: 'chorus', label: 'Chorus', lines: [
        "[D]When we [G]all get to [D]heaven[A7]",
        "[D]What a [G]day of re[A7]joicing that will [D]be",
        "[D]When we [G]all see [D]Jesus[A7]",
        "[D]We'll sing and [G]shout the [A7]victory[D]"
      ]},
      { type: 'verse', label: 'Verse 2', lines: [
        "[D]While we [G]walk the [D]pilgrim [A7]pathway",
        "[D]Clouds will [G]over[A7]spread the [D]sky",
        "[D]But when [G]trav'ling [D]days are [A7]over",
        "[D]Not a [G]shadow, [A7]not a [D]sigh"
      ]},
      { type: 'chorus', label: 'Chorus', lines: [
        "[D]When we [G]all get to [D]heaven[A7]",
        "[D]What a [G]day of re[A7]joicing that will [D]be",
        "[D]When we [G]all see [D]Jesus[A7]",
        "[D]We'll sing and [G]shout the [A7]victory[D]"
      ]},
      { type: 'verse', label: 'Verse 3', lines: [
        "[D]Let us [G]then be [D]true and [A7]faithful",
        "[D]Trusting, [G]serving [A7]every [D]day",
        "[D]Just one [G]glimpse of [D]Him in [A7]glory",
        "[D]Will the [G]toils of [A7]life re[D]pay"
      ]},
      { type: 'chorus', label: 'Chorus', lines: [
        "[D]When we [G]all get to [D]heaven[A7]",
        "[D]What a [G]day of re[A7]joicing that will [D]be",
        "[D]When we [G]all see [D]Jesus[A7]",
        "[D]We'll sing and [G]shout the [A7]victory[D]"
      ]}
    ]
  }
];
