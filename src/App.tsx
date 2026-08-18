import { useState } from 'react'

// ─── Palette ──────────────────────────────────────────────────────────
const C = {
  cream: '#FBF3E8',
  pink: '#F4B8C1',
  pinkDeep: '#E898A5',
  brown: '#3D2414',
  brownMid: '#7A5040',
  warmWhite: '#FFF8F0',
} as const

// ─── Sparkle (4-pointed star) ─────────────────────────────────────────
function Sparkle({
  size = 24,
  opacity = 1,
  style,
}: {
  size?: number
  opacity?: number
  style?: React.CSSProperties
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={C.warmWhite}
      style={{ opacity, flexShrink: 0, ...style }}
      aria-hidden
    >
      <path d="M12 0L13.5 10.5L24 12L13.5 13.5L12 24L10.5 13.5L0 12L10.5 10.5Z" />
    </svg>
  )
}

// ─── Cloud-scalloped section wrapper ─────────────────────────────────
function CloudSection({ children }: { children: React.ReactNode }) {
  const n = 32
  const vw = n * 10
  const topD =
    `M0,20 ` +
    Array.from({ length: n }, (_, i) => `Q${i * 10 + 5},0 ${(i + 1) * 10},20`).join(' ') +
    ` L${vw},20 Z`
  const botD =
    `M0,0 ` +
    Array.from({ length: n }, (_, i) => `Q${i * 10 + 5},20 ${(i + 1) * 10},0`).join(' ') +
    ` L${vw},0 Z`

  return (
    <>
      <svg
        viewBox={`0 0 ${vw} 20`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: 20, display: 'block' }}
        aria-hidden
      >
        <path d={topD} fill={C.pink} />
      </svg>
      <div style={{ background: C.pink }}>{children}</div>
      <svg
        viewBox={`0 0 ${vw} 20`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: 20, display: 'block' }}
        aria-hidden
      >
        <path d={botD} fill={C.pink} />
      </svg>
    </>
  )
}

// ─── Cursive section label in pill border ────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
      <span
        style={{
          fontFamily: "'Caveat', cursive",
          fontSize: '1.7rem',
          fontWeight: 600,
          color: C.brown,
          border: `2px solid ${C.brown}`,
          borderRadius: 999,
          padding: '2px 28px',
          background: C.cream,
          lineHeight: 1.5,
          display: 'inline-block',
        }}
      >
        {children}
      </span>
    </div>
  )
}

// ─── Skill pill ───────────────────────────────────────────────────────
function SkillPill({ label }: { label: string }) {
  return (
    <span
      style={{
        fontFamily: "'Nunito', sans-serif",
        fontSize: '0.82rem',
        fontWeight: 700,
        color: C.brown,
        border: `2px solid ${C.brown}`,
        borderRadius: 999,
        padding: '5px 15px',
        background: C.warmWhite,
        display: 'inline-block',
      }}
    >
      {label}
    </span>
  )
}

// ─── Experience accordion card ────────────────────────────────────────
function ExpCard({
  role,
  company,
  period,
  items,
}: {
  role: string
  company: string
  period: string
  items: string[]
}) {
  const [open, setOpen] = useState(true)
  return (
    <div
      style={{
        border: `2.5px solid ${C.brown}`,
        borderRadius: 20,
        overflow: 'hidden',
        background: C.warmWhite,
        marginBottom: 14,
        boxShadow: `4px 4px 0 ${C.brown}`,
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 22px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Baloo 2', sans-serif",
              fontWeight: 700,
              fontSize: '1rem',
              color: C.brown,
            }}
          >
            {role}
          </div>
          <div
            style={{
              fontFamily: "'Nunito', sans-serif",
              fontSize: '0.82rem',
              color: C.brownMid,
              marginTop: 2,
            }}
          >
            {company} · {period}
          </div>
        </div>
        <span
          style={{
            fontSize: '1.4rem',
            color: C.brown,
            lineHeight: 1,
            fontWeight: 300,
            marginLeft: 12,
          }}
        >
          {open ? '−' : '+'}
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 22px 18px' }}>
          {items.map((item, i) => (
            <div
              key={i}
              style={{
                fontFamily: "'Nunito', sans-serif",
                fontSize: '0.88rem',
                color: C.brown,
                paddingLeft: 18,
                position: 'relative',
                marginBottom: 7,
                lineHeight: 1.55,
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  left: 0,
                  color: C.pinkDeep,
                  fontWeight: 700,
                }}
              >
                ✦
              </span>
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Project card ─────────────────────────────────────────────────────
function ProjectCard({
  title,
  desc,
  tags,
  imgUrl,
}: {
  title: string
  desc: string
  tags: string[]
  imgUrl: string
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `2.5px solid ${C.brown}`,
        borderRadius: 22,
        overflow: 'hidden',
        background: C.warmWhite,
        transform: hovered ? 'translateY(-5px)' : 'translateY(0)',
        boxShadow: hovered ? `7px 7px 0 ${C.brown}` : `4px 4px 0 ${C.brown}`,
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      }}
    >
      <div
        style={{
          height: 150,
          backgroundImage: `url(${imgUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          borderBottom: `2.5px solid ${C.brown}`,
        }}
      />
      <div style={{ padding: '16px 20px' }}>
        <div
          style={{
            fontFamily: "'Baloo 2', sans-serif",
            fontWeight: 700,
            fontSize: '1.05rem',
            color: C.brown,
            marginBottom: 6,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: "'Nunito', sans-serif",
            fontSize: '0.82rem',
            color: C.brownMid,
            lineHeight: 1.55,
            marginBottom: 12,
          }}
        >
          {desc}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {tags.map((t) => (
            <span
              key={t}
              style={{
                fontSize: '0.7rem',
                fontFamily: "'Nunito', sans-serif",
                fontWeight: 700,
                color: C.warmWhite,
                background: C.brown,
                borderRadius: 999,
                padding: '2px 10px',
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Bear character SVG ───────────────────────────────────────────────
function Bear({ size = 80 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 90" width={size} height={size} aria-hidden>
      <circle cx="22" cy="20" r="16" fill={C.pinkDeep} />
      <circle cx="22" cy="20" r="10" fill="#F4C0C8" />
      <circle cx="78" cy="20" r="16" fill={C.pinkDeep} />
      <circle cx="78" cy="20" r="10" fill="#F4C0C8" />
      <circle cx="50" cy="54" r="32" fill="#F2BFCA" />
      <circle cx="38" cy="48" r="5.5" fill={C.brown} />
      <circle cx="62" cy="48" r="5.5" fill={C.brown} />
      <circle cx="40" cy="46" r="1.8" fill="white" />
      <circle cx="64" cy="46" r="1.8" fill="white" />
      <ellipse cx="50" cy="59" rx="12" ry="9" fill="#F4D0D4" />
      <circle cx="50" cy="57" r="3.2" fill={C.brown} />
      <path
        d="M44,66 Q50,73 56,66"
        stroke={C.brown}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="34" cy="62" r="6.5" fill="rgba(232,152,165,0.4)" />
      <circle cx="66" cy="62" r="6.5" fill="rgba(232,152,165,0.4)" />
    </svg>
  )
}

// ─── Profile bear SVG (larger, for the hero circle) ──────────────────
function ProfileBear() {
  return (
    <svg viewBox="0 0 100 100" width="150" height="150" aria-hidden>
      <circle cx="26" cy="26" r="20" fill={C.pinkDeep} />
      <circle cx="26" cy="26" r="13" fill="#F4C0C8" />
      <circle cx="74" cy="26" r="20" fill={C.pinkDeep} />
      <circle cx="74" cy="26" r="13" fill="#F4C0C8" />
      <circle cx="50" cy="60" r="36" fill="#F2BFCA" />
      <circle cx="37" cy="54" r="6" fill={C.brown} />
      <circle cx="63" cy="54" r="6" fill={C.brown} />
      <circle cx="39" cy="52" r="2" fill="white" />
      <circle cx="65" cy="52" r="2" fill="white" />
      <ellipse cx="50" cy="66" rx="14" ry="10" fill="#F4D0D4" />
      <circle cx="50" cy="64" r="3.8" fill={C.brown} />
      <path
        d="M43,74 Q50,81 57,74"
        stroke={C.brown}
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="32" cy="69" r="7.5" fill="rgba(232,152,165,0.4)" />
      <circle cx="68" cy="69" r="7.5" fill="rgba(232,152,165,0.4)" />
    </svg>
  )
}

// ─── App ──────────────────────────────────────────────────────────────
export default function App() {
  return (
    <div
      style={{
        fontFamily: "'Nunito', sans-serif",
        background: C.cream,
        color: C.brown,
        overflowX: 'hidden',
      }}
    >
      {/* ══ HERO ═══════════════════════════════════════════════════════ */}
      <section
        style={{
          minHeight: '100vh',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px 24px 64px',
        }}
      >
        {/* Sparkles — left column */}
        <Sparkle size={42} style={{ position: 'absolute', top: '6%', left: '5%' }} />
        <Sparkle size={26} style={{ position: 'absolute', top: '17%', left: '10%' }} opacity={0.65} />
        <Sparkle size={32} style={{ position: 'absolute', top: '36%', left: '3%' }} opacity={0.75} />
        <Sparkle size={46} style={{ position: 'absolute', top: '56%', left: '6%' }} />
        <Sparkle size={22} style={{ position: 'absolute', top: '74%', left: '4%' }} opacity={0.55} />
        <Sparkle size={30} style={{ position: 'absolute', top: '88%', left: '12%' }} opacity={0.6} />

        {/* Sparkles — right column */}
        <Sparkle size={42} style={{ position: 'absolute', top: '6%', right: '5%' }} />
        <Sparkle size={26} style={{ position: 'absolute', top: '20%', right: '10%' }} opacity={0.65} />
        <Sparkle size={32} style={{ position: 'absolute', top: '40%', right: '3%' }} opacity={0.75} />
        <Sparkle size={46} style={{ position: 'absolute', top: '60%', right: '6%' }} />
        <Sparkle size={22} style={{ position: 'absolute', top: '78%', right: '4%' }} opacity={0.55} />

        {/* Large orbit rings — background decoration */}
        {[
          { top: '8%', left: '-3%', rotate: -22 },
          { top: '6%', right: '-3%', rotate: 22 },
          { top: '52%', left: '-1%', rotate: -15 },
          { top: '50%', right: '-1%', rotate: 15 },
        ].map((pos, i) => (
          <div
            key={i}
            aria-hidden
            style={{
              position: 'absolute',
              width: 260,
              height: 100,
              border: `1.5px solid ${C.brown}`,
              borderRadius: '50%',
              transform: `rotate(${pos.rotate}deg)`,
              opacity: 0.14,
              pointerEvents: 'none',
              ...('left' in pos ? { left: pos.left } : { right: pos.right }),
              top: pos.top,
            }}
          />
        ))}

        {/* Profile circle with orbit rings */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 210,
            height: 210,
            marginBottom: 32,
          }}
        >
          {/* Orbit rings */}
          {[
            { w: 320, h: 110, angle: -34 },
            { w: 320, h: 110, angle: 34 },
          ].map((o, i) => (
            <div
              key={i}
              aria-hidden
              style={{
                position: 'absolute',
                width: o.w,
                height: o.h,
                border: `1.5px solid rgba(61,36,20,0.28)`,
                borderRadius: '50%',
                transform: `rotate(${o.angle}deg)`,
              }}
            />
          ))}

          {/* Photo circle */}
          <div
            style={{
              width: 188,
              height: 188,
              borderRadius: '50%',
              border: `4px solid ${C.brown}`,
              background: `linear-gradient(135deg, ${C.pink} 0%, #EDD8C5 55%, ${C.pink} 100%)`,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              zIndex: 1,
              boxShadow: `5px 5px 0 ${C.brown}`,
            }}
          >
            <ProfileBear />
          </div>
        </div>

        {/* Name */}
        <h1
          style={{
            fontFamily: "'Baloo 2', sans-serif",
            fontSize: 'clamp(2.4rem, 5vw, 3.8rem)',
            fontWeight: 800,
            color: C.brown,
            lineHeight: 1.05,
            textAlign: 'center',
            letterSpacing: '-0.5px',
            marginBottom: 4,
          }}
        >
          Ji-yeon Park
        </h1>
        <p
          style={{
            fontFamily: "'Caveat', cursive",
            fontSize: '1.75rem',
            color: C.brownMid,
            textAlign: 'center',
            marginBottom: 18,
          }}
        >
          박지연
        </p>

        {/* Title pill */}
        <div
          style={{
            fontFamily: "'Baloo 2', sans-serif",
            fontSize: '1.05rem',
            fontWeight: 600,
            color: C.brown,
            border: `2.5px solid ${C.brown}`,
            borderRadius: 999,
            padding: '7px 28px',
            background: C.pink,
            boxShadow: `3px 3px 0 ${C.brown}`,
            marginBottom: 22,
          }}
        >
          Product Designer & Frontend Developer
        </div>

        {/* Info pills */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 10,
            marginBottom: 22,
          }}
        >
          {['📍 Seoul, Korea', '✉️ jiyeon@studio.kr', '🌐 jiyeonpark.kr'].map((text) => (
            <span
              key={text}
              style={{
                fontFamily: "'Nunito', sans-serif",
                fontSize: '0.85rem',
                fontWeight: 600,
                color: C.brown,
                border: `2px solid ${C.brown}`,
                borderRadius: 999,
                padding: '4px 16px',
                background: C.warmWhite,
              }}
            >
              {text}
            </span>
          ))}
        </div>

        {/* Tagline */}
        <p
          style={{
            fontFamily: "'Caveat', cursive",
            fontSize: '1.3rem',
            color: C.brownMid,
            textAlign: 'center',
            maxWidth: 420,
            lineHeight: 1.5,
          }}
        >
          "Designing moments of delight — one pixel at a time ✦"
        </p>

        {/* Scroll cue */}
        <div
          style={{
            position: 'absolute',
            bottom: 28,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            opacity: 0.38,
          }}
        >
          <span style={{ fontFamily: "'Caveat', cursive", fontSize: '0.9rem' }}>scroll</span>
          <div style={{ width: 1, height: 30, background: C.brown }} />
        </div>
      </section>

      {/* ══ ABOUT ══════════════════════════════════════════════════════ */}
      <CloudSection>
        <div
          style={{
            maxWidth: 620,
            margin: '0 auto',
            padding: '44px 28px',
            textAlign: 'center',
          }}
        >
          <Label>about me</Label>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
            <Bear size={96} />
          </div>
          <p
            style={{
              fontFamily: "'Nunito', sans-serif",
              fontSize: '1rem',
              color: C.brown,
              lineHeight: 1.9,
              marginBottom: 22,
            }}
          >
            Hi! I&apos;m Ji-yeon — a Seoul-based product designer with 3+ years of experience
            crafting delightful digital experiences. I believe great design is both beautiful and
            purposeful. From mobile apps to brand identities, I bring a kawaii touch to every
            project while keeping user needs at the center of every decision.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
            {['Figma', 'React', 'Illustration', 'Motion Design', 'UX Research'].map((s) => (
              <SkillPill key={s} label={s} />
            ))}
          </div>
        </div>
      </CloudSection>

      {/* ══ SKILLS ═════════════════════════════════════════════════════ */}
      <section
        style={{
          maxWidth: 760,
          margin: '0 auto',
          padding: '72px 32px',
          position: 'relative',
        }}
      >
        <Sparkle size={34} style={{ position: 'absolute', left: -6, top: 44 }} opacity={0.65} />
        <Sparkle size={24} style={{ position: 'absolute', right: -4, top: 90 }} opacity={0.5} />

        <Label>skills & tools</Label>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 36,
          }}
        >
          {[
            {
              cat: '✦ Design',
              items: ['Figma', 'Adobe Illustrator', 'Photoshop', 'After Effects', 'Procreate', 'Framer'],
            },
            {
              cat: '✦ Development',
              items: ['React', 'TypeScript', 'Tailwind CSS', 'Next.js', 'Framer Motion', 'Webflow'],
            },
            {
              cat: '✦ Strategy',
              items: ['User Research', 'Prototyping', 'Design Systems', 'Brand Strategy', 'Art Direction'],
            },
          ].map(({ cat, items }) => (
            <div key={cat}>
              <div
                style={{
                  fontFamily: "'Caveat', cursive",
                  fontSize: '1.2rem',
                  fontWeight: 600,
                  color: C.brownMid,
                  marginBottom: 12,
                }}
              >
                {cat}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {items.map((s) => (
                  <SkillPill key={s} label={s} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══ EXPERIENCE ═════════════════════════════════════════════════ */}
      <CloudSection>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '44px 28px' }}>
          <Label>experience</Label>
          <ExpCard
            role="Product Designer"
            company="Kakao Corp"
            period="2023 — Present"
            items={[
              'Designed UX flows for KakaoTalk mini-apps serving 15M+ daily active users',
              'Led visual identity refresh for Kakao Friends Shop e-commerce platform',
              'Built and maintained design system components in React and Figma',
              'Ran usability studies across Seoul, Busan, and Tokyo user panels',
            ]}
          />
          <ExpCard
            role="UI/UX Designer"
            company="Naver Z · ZEPETO"
            period="2021 — 2023"
            items={[
              'Designed avatar customization interfaces for a global metaverse platform',
              'Improved D7 retention by 24% through a redesigned onboarding flow',
              'Collaborated with 3D & AR teams on filter visual design for iOS and Android',
              'Created motion guidelines adopted across the entire ZEPETO design team',
            ]}
          />
        </div>
      </CloudSection>

      {/* ══ PROJECTS ═══════════════════════════════════════════════════ */}
      <section
        style={{
          maxWidth: 800,
          margin: '0 auto',
          padding: '72px 32px',
          position: 'relative',
        }}
      >
        <Sparkle size={38} style={{ position: 'absolute', left: -10, top: 36 }} opacity={0.65} />
        <Sparkle size={26} style={{ position: 'absolute', right: -6, top: 64 }} opacity={0.5} />

        <Label>projects</Label>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
            gap: 22,
          }}
        >
          <ProjectCard
            title="Bloom App"
            desc="A mindfulness companion app with illustrated kawaii characters guiding daily mood check-ins."
            tags={['React Native', 'Figma', 'Motion Design']}
            imgUrl="https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=400&fit=crop&auto=format"
          />
          <ProjectCard
            title="Café Haru"
            desc="Full brand identity and website for a cozy Seoul indie coffee shop with a retro pastel aesthetic."
            tags={['Webflow', 'Illustrator', 'Branding']}
            imgUrl="https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&h=400&fit=crop&auto=format"
          />
          <ProjectCard
            title="Stellarkit"
            desc="A playful UI component library built for the Korean startup ecosystem. 200+ components."
            tags={['React', 'TypeScript', 'Design System']}
            imgUrl="https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600&h=400&fit=crop&auto=format"
          />
        </div>
      </section>

      {/* ══ EDUCATION ══════════════════════════════════════════════════ */}
      <CloudSection>
        <div
          style={{
            maxWidth: 640,
            margin: '0 auto',
            padding: '44px 28px',
            textAlign: 'center',
          }}
        >
          <Label>education</Label>
          <div
            style={{
              border: `2.5px solid ${C.brown}`,
              borderRadius: 22,
              background: C.warmWhite,
              padding: '22px 36px',
              boxShadow: `4px 4px 0 ${C.brown}`,
              display: 'inline-block',
            }}
          >
            <div
              style={{
                fontFamily: "'Baloo 2', sans-serif",
                fontWeight: 800,
                fontSize: '1.1rem',
                color: C.brown,
              }}
            >
              홍익대학교 · Hongik University
            </div>
            <div
              style={{
                fontFamily: "'Nunito', sans-serif",
                fontSize: '0.9rem',
                color: C.brownMid,
                marginTop: 5,
              }}
            >
              B.F.A. Visual Communication Design
            </div>
            <div
              style={{
                fontFamily: "'Caveat', cursive",
                fontSize: '1.15rem',
                color: C.pinkDeep,
                marginTop: 3,
              }}
            >
              Class of 2021
            </div>
          </div>
        </div>
      </CloudSection>

      {/* ══ CONTACT ════════════════════════════════════════════════════ */}
      <section
        style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: '72px 32px 64px',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        <Sparkle size={40} style={{ position: 'absolute', left: 0, top: 28 }} opacity={0.65} />
        <Sparkle size={28} style={{ position: 'absolute', right: 6, top: 52 }} opacity={0.6} />
        <Sparkle size={22} style={{ position: 'absolute', left: 22, bottom: 32 }} opacity={0.5} />
        <Sparkle size={30} style={{ position: 'absolute', right: 0, bottom: 48 }} opacity={0.5} />

        <Label>let&apos;s connect</Label>

        <p
          style={{
            fontFamily: "'Caveat', cursive",
            fontSize: '1.35rem',
            color: C.brownMid,
            marginBottom: 34,
            lineHeight: 1.5,
          }}
        >
          Open to full-time roles, freelance projects, and creative collaborations ✦
        </p>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 14,
            marginBottom: 52,
          }}
        >
          {[
            { label: 'Email', value: 'jiyeon@studio.kr', href: 'mailto:jiyeon@studio.kr' },
            { label: 'GitHub', value: 'github.com/jiyeonpark', href: '#' },
            { label: 'LinkedIn', value: 'in/jiyeonpark', href: '#' },
            { label: 'Instagram', value: '@jiyeon.designs', href: '#' },
          ].map(({ label, value, href }) => (
            <a
              key={label}
              href={href}
              style={{
                fontFamily: "'Baloo 2', sans-serif",
                fontWeight: 600,
                fontSize: '0.9rem',
                color: C.brown,
                border: `2.5px solid ${C.brown}`,
                borderRadius: 999,
                padding: '10px 22px',
                background: C.warmWhite,
                textDecoration: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
                boxShadow: `3px 3px 0 ${C.brown}`,
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLAnchorElement
                el.style.transform = 'translate(-2px,-2px)'
                el.style.boxShadow = `5px 5px 0 ${C.brown}`
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLAnchorElement
                el.style.transform = ''
                el.style.boxShadow = `3px 3px 0 ${C.brown}`
              }}
            >
              <span
                style={{
                  fontSize: '0.7rem',
                  color: C.brownMid,
                  fontFamily: "'Nunito', sans-serif",
                  fontWeight: 400,
                }}
              >
                {label}
              </span>
              {value}
            </a>
          ))}
        </div>

        <div
          style={{
            fontFamily: "'Caveat', cursive",
            fontSize: '1rem',
            color: 'rgba(61,36,20,0.35)',
          }}
        >
          Designed with ✦ love in Seoul · 2024
        </div>
      </section>
    </div>
  )
}
