"use client";
// All landmark placements on the globe. ~2,270 lines of pure JSX — each
// <Lm /> wraps a monument's primitive mesh children at its pre-computed
// position from locations.ts with hover data from info.ts. Extracted from
// LocationClient.tsx so the scene file can stay navigable.

import { L } from "./locations";
import { INFO } from "./info";
import {
  Lm,
  Mat,
  MatStone,
  MatMarble,
  MatMetal,
  MatPatina,
  MatGold,
  MatSand,
  MatGlass,
  Box,
  Cone,
  Cyl,
  Ball,
} from "./landmark";

export default
function AllLandmarks() {
  return (
    <>
      {/* ── Great Wall of China ───────────────────────────────────────────────── */}
      <Lm p={L.greatWall} info={INFO.greatWall} mk="greatWall">
        {/* Wall body */}
        <Box p={[0,0.07,0]}       s={[1.4,0.14,0.24]} c="#cfc3a6" M={MatStone}/>
        {/* Walkway on top */}
        <Box p={[0,0.16,0]}       s={[1.4,0.04,0.24]} c="#bfb396" M={MatStone}/>
        {/* Battlement merlons */}
        {([-0.55,-0.33,-0.11,0.11,0.33,0.55] as number[]).map((x,i)=>(
          <Box key={i} p={[x,0.24,0]} s={[0.14,0.16,0.24]} c="#bfb396" M={MatStone}/>
        ))}
        {/* Central watchtower */}
        <Box p={[0,0.32,0]}       s={[0.32,0.32,0.3]}  c="#d4c8b0" M={MatStone}/>
        <Box p={[0,0.5,0]}        s={[0.34,0.06,0.32]} c="#c4b89e" M={MatStone}/>
        {/* Tower crenellations */}
        {([-0.12,0,0.12] as number[]).map((x,i)=>(
          <Box key={i} p={[x,0.58,0]} s={[0.07,0.14,0.32]} c="#c4b89e" M={MatStone}/>
        ))}
        {/* Arrow slits */}
        <Box p={[0,0.38,0.16]}    s={[0.06,0.12,0.02]} c="#a09080" M={MatStone}/>
      </Lm>

      {/* ── Petra Treasury ────────────────────────────────────────────────────── */}
      <Lm p={L.petra} info={INFO.petra} mk="petra">
        {/* Rose sandstone rock face */}
        <Box p={[0,0.3,0]}          s={[0.72,0.6,0.06]}  c="#f0a060" M={MatSand}/>
        {/* Lower colonnade — 4 columns */}
        {([-0.24,-0.08,0.08,0.24] as number[]).map((x,i)=>(
          <Cyl key={i} p={[x,0.28,0.06]} rt={0.03} rb={0.03} h={0.44} seg={12} c="#e08850" M={MatSand}/>
        ))}
        {/* Entablature */}
        <Box p={[0,0.52,0.04]}      s={[0.62,0.06,0.06]} c="#e07848" M={MatSand}/>
        {/* Lower triangular pediment */}
        <Cone p={[0,0.61,0.04]}     r={0.32} h={0.14} seg={4} c="#f09060" M={MatSand}/>
        {/* Upper broken pediment / tholos drum */}
        <Cyl p={[0,0.75,0.04]}      rt={0.07} rb={0.1} h={0.14} seg={12} c="#e88050" M={MatSand}/>
        {/* Tholos urn */}
        <Ball p={[0,0.84,0.04]}     r={0.075} c="#f09060" M={MatSand}/>
        {/* 2 upper columns */}
        <Cyl p={[-0.18,0.63,0.04]}  rt={0.024} rb={0.024} h={0.24} seg={12} c="#e07848" M={MatSand}/>
        <Cyl p={[0.18,0.63,0.04]}   rt={0.024} rb={0.024} h={0.24} seg={12} c="#e07848" M={MatSand}/>
        {/* Dark door niche */}
        <Box p={[0,0.16,0.07]}      s={[0.1,0.22,0.02]} c="#c05030" M={MatSand}/>
      </Lm>

      {/* ── Christ the Redeemer ───────────────────────────────────────────────── */}
      <Lm p={L.christRedeem} info={INFO.christRedeem} mk="christRedeem">
        {/* Stone pedestal */}
        <Box p={[0,0.07,0]}    s={[0.16,0.14,0.16]}  c="#b0a890" M={MatStone}/>
        {/* Robe/body — soapstone */}
        <Cyl p={[0,0.37,0]}    rt={0.06} rb={0.11}   h={0.5}  seg={12} c="#f0ecdc" M={MatMarble}/>
        {/* Outstretched arms */}
        <Box p={[0,0.54,0]}    s={[0.78,0.07,0.07]}  c="#f0ecdc" M={MatMarble}/>
        {/* Head */}
        <Ball p={[0,0.72,0]}   r={0.088} c="#ffe8c8" M={MatMarble}/>
        {/* Hands */}
        <Ball p={[-0.4,0.54,0]} r={0.04} c="#ffe8c8" M={MatMarble}/>
        <Ball p={[0.4,0.54,0]}  r={0.04} c="#ffe8c8" M={MatMarble}/>
        {/* Feet at robe base */}
        <Box p={[0,0.12,0.06]} s={[0.1,0.04,0.05]}  c="#e8e4d0" M={MatMarble}/>
      </Lm>

      {/* ── Machu Picchu ──────────────────────────────────────────────────────── */}
      <Lm p={L.machuPicchu} info={INFO.machuPicchu} mk="machuPicchu">
        {/* Mountain terraces — stepped green hillside */}
        <Box p={[0,0.04,0]}     s={[0.86,0.08,0.54]}  c="#4a7838"/>
        <Box p={[0,0.15,0]}     s={[0.68,0.14,0.44]}  c="#5a9048"/>
        <Box p={[0,0.3,0]}      s={[0.52,0.16,0.34]}  c="#4a8038"/>
        <Box p={[0,0.46,0]}     s={[0.38,0.14,0.26]}  c="#5a9048"/>
        {/* Inca stone buildings */}
        <Box p={[-0.08,0.58,0]} s={[0.14,0.16,0.12]}  c="#c8bc9a"/>
        <Box p={[0.1,0.58,0]}   s={[0.12,0.16,0.12]}  c="#c0b490"/>
        <Box p={[0,0.58,-0.08]} s={[0.1,0.12,0.1]}    c="#c8bc9a"/>
        {/* Thatched/stone roofs */}
        <Cone p={[-0.08,0.68,0]} r={0.1}  h={0.1} seg={4} c="#a09070"/>
        <Cone p={[0.1,0.68,0]}   r={0.09} h={0.1} seg={4} c="#a09070"/>
        {/* Intihuatana stone (ritual pillar) */}
        <Box p={[0.16,0.52,0.08]} s={[0.05,0.08,0.05]} c="#d0c8a0"/>
      </Lm>

      {/* ── Chichen Itza ──────────────────────────────────────────────────────── */}
      <Lm p={L.chichenItza} info={INFO.chichenItza} mk="chichenItza">
        {/* El Castillo — 4-sided step pyramid */}
        <Box p={[0,0.05,0]}    s={[0.86,0.1,0.86]}   c="#f0d868"/>
        <Box p={[0,0.19,0]}    s={[0.66,0.18,0.66]}  c="#eed060"/>
        <Box p={[0,0.36,0]}    s={[0.48,0.18,0.48]}  c="#f0d868"/>
        <Box p={[0,0.53,0]}    s={[0.32,0.18,0.32]}  c="#eed060"/>
        {/* Temple top */}
        <Box p={[0,0.68,0]}    s={[0.22,0.18,0.2]}   c="#f8e070"/>
        <Box p={[0,0.8,0]}     s={[0.16,0.08,0.16]}  c="#f0d058"/>
        <Cone p={[0,0.86,0]}   r={0.07} h={0.08} seg={4} c="#f0d058"/>
        {/* Central staircase risers on each face */}
        <Box p={[0,0.37,0.445]}  s={[0.1,0.74,0.04]} c="#e8c850"/>
        <Box p={[0,0.37,-0.445]} s={[0.1,0.74,0.04]} c="#e8c850"/>
        <Box p={[0.445,0.37,0]}  s={[0.04,0.74,0.1]} c="#e8c850"/>
        <Box p={[-0.445,0.37,0]} s={[0.04,0.74,0.1]} c="#e8c850"/>
      </Lm>

      {/* ── Roman Colosseum ───────────────────────────────────────────────────── */}
      <Lm p={L.colosseum} info={INFO.colosseum} mk="colosseum">
        {/* Foundation */}
        <mesh position={[0,0.04,0]}>
          <torusGeometry args={[0.38,0.12,24,80]}/>
          <MatStone c="#e8d898"/>
        </mesh>
        {/* First arcade tier */}
        <mesh position={[0,0.2,0]}>
          <torusGeometry args={[0.36,0.1,24,80]}/>
          <MatStone c="#f0e0a0"/>
        </mesh>
        {/* Second arcade tier */}
        <mesh position={[0,0.34,0]}>
          <torusGeometry args={[0.33,0.09,22,72]}/>
          <MatStone c="#f4e8a8"/>
        </mesh>
        {/* Attic story */}
        <mesh position={[0,0.46,0]}>
          <torusGeometry args={[0.3,0.06,18,64]}/>
          <MatStone c="#e8d890"/>
        </mesh>
        {/* Arena floor — packed sand */}
        <Cyl p={[0,0.02,0]} rt={0.26} rb={0.26} h={0.04} seg={64} c="#d8c880" M={MatSand}/>
      </Lm>

      {/* ── Taj Mahal ─────────────────────────────────────────────────────────── */}
      <Lm p={L.tajMahal} info={INFO.tajMahal} mk="tajMahal">
        {/* Great plinth — white Makrana marble */}
        <Box p={[0,0.04,0]}   s={[0.82,0.08,0.82]}  c="#f0eaf8" M={MatMarble}/>
        {/* Main hall */}
        <Box p={[0,0.2,0]}    s={[0.44,0.24,0.44]}  c="#faf6ff" M={MatMarble}/>
        {/* Iwan arches */}
        <Box p={[0,0.22,0.22]} s={[0.2,0.2,0.02]}   c="#f0ecff" M={MatMarble}/>
        <Box p={[0,0.22,-0.22]} s={[0.2,0.2,0.02]}  c="#f0ecff" M={MatMarble}/>
        {/* Dome drum */}
        <Cyl p={[0,0.36,0]}   rt={0.17} rb={0.18}   h={0.12} seg={24} c="#fff8ff" M={MatMarble}/>
        {/* Onion dome — layered Cyl stack */}
        <Cyl p={[0,0.44,0]}   rt={0.21} rb={0.17}   h={0.1}  seg={24} c="#fffcff" M={MatMarble}/>
        <Cyl p={[0,0.54,0]}   rt={0.19} rb={0.21}   h={0.1}  seg={24} c="#fffcff" M={MatMarble}/>
        <Cyl p={[0,0.63,0]}   rt={0.13} rb={0.19}   h={0.1}  seg={24} c="#fff8ff" M={MatMarble}/>
        <Cyl p={[0,0.71,0]}   rt={0.06} rb={0.13}   h={0.1}  seg={24} c="#fffcff" M={MatMarble}/>
        <Cone p={[0,0.79,0]}  r={0.06}  h={0.12}    seg={24} c="#f8f4ff" M={MatMarble}/>
        {/* Finial spire — gilded brass */}
        <Cyl p={[0,0.87,0]}   rt={0.01} rb={0.022}  h={0.1}  seg={12} c="#d4c060" M={MatGold}/>
        <Ball p={[0,0.93,0]}  r={0.016} c="#e8d070" M={MatGold}/>
        {/* 4 minarets */}
        {([[-0.32,-0.32],[-0.32,0.32],[0.32,-0.32],[0.32,0.32]] as [number,number][]).map(([mx,mz],i)=>(
          <group key={i}>
            <Cyl  p={[mx,0.2,mz]}  rt={0.034} rb={0.036} h={0.44} seg={16} c="#f8f4ff" M={MatMarble}/>
            <Cyl  p={[mx,0.45,mz]} rt={0.042} rb={0.034} h={0.06} seg={16} c="#f4f0ff" M={MatMarble}/>
            <Cyl  p={[mx,0.52,mz]} rt={0.034} rb={0.042} h={0.06} seg={16} c="#f4f0ff" M={MatMarble}/>
            <Cone p={[mx,0.57,mz]} r={0.036}  h={0.1}    seg={16} c="#f0ecff" M={MatMarble}/>
            <Ball p={[mx,0.63,mz]} r={0.016}  c="#d4c060" M={MatGold}/>
          </group>
        ))}
      </Lm>

      {/* ── Eiffel Tower ──────────────────────────────────────────────────────── */}
      <Lm p={L.eiffelTower} info={INFO.eiffelTower} mk="eiffelTower" s={0.9}>
        {/* 4 arching legs — puddled iron lattice */}
        {([[-1,-1],[1,-1],[-1,1],[1,1]] as [number,number][]).map(([sx,sz],i)=>(
          <group key={i}>
            <Box p={[sx*0.23,0.08,sz*0.23]} s={[0.09,0.16,0.09]} c="#c8981a" M={MatMetal}/>
            <Box p={[sx*0.17,0.22,sz*0.17]} s={[0.08,0.16,0.08]} c="#d4a820" M={MatMetal}/>
            <Box p={[sx*0.1, 0.36,sz*0.1]}  s={[0.07,0.16,0.07]} c="#d4a820" M={MatMetal}/>
          </group>
        ))}
        {/* Diagonal cross-braces */}
        <Box p={[0,0.12,0]}  s={[0.42,0.04,0.06]} c="#c89018" M={MatMetal}/>
        <Box p={[0,0.12,0]}  s={[0.06,0.04,0.42]} c="#c89018" M={MatMetal}/>
        {/* First platform */}
        <Box p={[0,0.44,0]}  s={[0.3,0.06,0.3]}   c="#c89018" M={MatMetal}/>
        {/* Second tapered section */}
        <Cyl p={[0,0.62,0]}  rt={0.07} rb={0.1}   h={0.36} seg={12} c="#d4a820" M={MatMetal}/>
        {/* Second platform */}
        <Box p={[0,0.82,0]}  s={[0.16,0.06,0.16]} c="#c89018" M={MatMetal}/>
        {/* Broadcast mast */}
        <Cyl p={[0,0.96,0]}  rt={0.008} rb={0.06} h={0.28} seg={12} c="#e0b828" M={MatMetal}/>
        <Ball p={[0,1.12,0]} r={0.018} c="#ffe840" M={MatGold}/>
      </Lm>

      {/* ── Acropolis / Parthenon ─────────────────────────────────────────────── */}
      <Lm p={L.acropolis} info={INFO.acropolis} mk="acropolis">
        {/* Rock of the Acropolis — limestone */}
        <Cone p={[0,0.13,0]}  r={0.58} h={0.26} seg={8}  c="#c8bc9a" M={MatStone}/>
        {/* Platform (stylobate) — Pentelic marble */}
        <Box p={[0,0.28,0]}   s={[0.74,0.06,0.38]}        c="#e8dcc0" M={MatMarble}/>
        {/* 10 fluted columns */}
        {([-0.3,-0.18,-0.06,0.06,0.18,0.3] as number[]).map((x,i)=>(
          <Cyl key={i} p={[x,0.52,0]} rt={0.042} rb={0.048} h={0.44} seg={16} c="#ede3c8" M={MatMarble}/>
        ))}
        {/* Side columns */}
        <Cyl p={[-0.3,0.52, 0.14]} rt={0.042} rb={0.048} h={0.44} seg={16} c="#ede3c8" M={MatMarble}/>
        <Cyl p={[-0.3,0.52,-0.14]} rt={0.042} rb={0.048} h={0.44} seg={16} c="#ede3c8" M={MatMarble}/>
        <Cyl p={[0.3,0.52, 0.14]}  rt={0.042} rb={0.048} h={0.44} seg={16} c="#ede3c8" M={MatMarble}/>
        <Cyl p={[0.3,0.52,-0.14]}  rt={0.042} rb={0.048} h={0.44} seg={16} c="#ede3c8" M={MatMarble}/>
        {/* Entablature */}
        <Box p={[0,0.76,0]}   s={[0.74,0.08,0.38]}        c="#e0d4b8" M={MatMarble}/>
        {/* Gabled pediment */}
        <Cone p={[0,0.88,0]}  r={0.38} h={0.2} seg={4}    c="#d8cdb0" M={MatMarble}/>
      </Lm>

      {/* ── Stonehenge ────────────────────────────────────────────────────────── */}
      <Lm p={L.stonehenge} s={0.1125} info={INFO.stonehenge} mk="stonehenge">
        {/* Outer ring: 12 Sarsen uprights — weathered sandstone */}
        {Array.from({length:12},(_,i)=>{
          const a=i*Math.PI*2/12;
          return <Box key={i} p={[Math.sin(a)*0.38,0.16,Math.cos(a)*0.38]} s={[0.08,0.32,0.09]} c="#b8b0a0" M={MatStone}/>;
        })}
        {/* Outer lintels: 6 horizontal blocks, rotated tangentially */}
        {Array.from({length:6},(_,i)=>{
          const a=(i*2+1)*Math.PI/12;
          return (
            <mesh key={i} position={[Math.sin(a)*0.38, 0.34, Math.cos(a)*0.38]} rotation={[0,-a,0] as any}>
              <boxGeometry args={[0.18,0.07,0.1]}/>
              <Mat c="#a8a098"/>
            </mesh>
          );
        })}
        {/* Inner horseshoe: 5 trilithon pairs with lintels */}
        {([0,72,144,216,288] as number[]).map((deg,i)=>{
          const a=deg*Math.PI/180;
          const px=Math.sin(a)*0.22, pz=Math.cos(a)*0.22;
          const ox=Math.cos(a)*0.06, oz=-Math.sin(a)*0.06;
          return (
            <group key={i}>
              <Box p={[px-ox, 0.2, pz-oz]} s={[0.07,0.4,0.08]} c="#a09890"/>
              <Box p={[px+ox, 0.2, pz+oz]} s={[0.07,0.4,0.08]} c="#a09890"/>
              <mesh position={[px,0.42,pz]} rotation={[0,-a,0] as any}>
                <boxGeometry args={[0.18,0.07,0.09]}/>
                <Mat c="#988880"/>
              </mesh>
            </group>
          );
        })}
        {/* Altar stone in centre */}
        <Box p={[0,0.03,0]} s={[0.12,0.06,0.07]} c="#a09888"/>
      </Lm>

      {/* ── Sagrada Família ───────────────────────────────────────────────────── */}
      <Lm p={L.sagradaFamilia} info={INFO.sagradaFamilia} mk="sagradaFamilia">
        {/* Nave body */}
        <Box p={[0,0.1,0]}          s={[0.64,0.2,0.38]}  c="#f0ca88"/>
        {/* Crossing / apse roof */}
        <Box p={[0,0.22,0]}         s={[0.44,0.08,0.3]}  c="#e8c080"/>
        {/* Tallest central tower — Jesus tower */}
        <Cyl p={[0,0.78,0]}         rt={0.038} rb={0.07} h={1.12} seg={12} c="#f2cc88"/>
        <Ball p={[0,1.36,0]}        r={0.055} c="#ffe840"/>
        {/* Nativity facade — 4 tall bell towers front */}
        <Cyl p={[-0.19,0.64,0.17]}  rt={0.026} rb={0.048} h={0.84} seg={10} c="#e8c078"/>
        <Ball p={[-0.19,1.08,0.17]} r={0.042} c="#ffda30"/>
        <Cyl p={[0.19,0.64,0.17]}   rt={0.026} rb={0.048} h={0.84} seg={10} c="#e8c078"/>
        <Ball p={[0.19,1.08,0.17]}  r={0.042} c="#ffda30"/>
        {/* Passion facade — 4 towers back */}
        <Cyl p={[-0.19,0.58,-0.17]} rt={0.024} rb={0.044} h={0.72} seg={10} c="#e8c078"/>
        <Ball p={[-0.19,0.95,-0.17]} r={0.038} c="#ffda30"/>
        <Cyl p={[0.19,0.58,-0.17]}  rt={0.024} rb={0.044} h={0.72} seg={10} c="#e8c078"/>
        <Ball p={[0.19,0.95,-0.17]} r={0.038} c="#ffda30"/>
        {/* Apse towers — 4 shorter */}
        <Cyl p={[-0.1,0.48,0]}      rt={0.02}  rb={0.038} h={0.52} seg={10} c="#dcc070"/>
        <Ball p={[-0.1,0.76,0]}     r={0.032} c="#ffd020"/>
        <Cyl p={[0.1,0.48,0]}       rt={0.02}  rb={0.038} h={0.52} seg={10} c="#dcc070"/>
        <Ball p={[0.1,0.76,0]}      r={0.032} c="#ffd020"/>
      </Lm>

      {/* ── Angkor Wat ────────────────────────────────────────────────────────── */}
      <Lm p={L.angkorWat} info={INFO.angkorWat} mk="angkorWat">
        {/* Moat — reflective water */}
        <Box p={[0,-0.01,0]}  s={[1.1,0.02,1.1]}   c="#4888b8" M={MatGlass}/>
        {/* Three galleried terraces */}
        <Box p={[0,0.06,0]}   s={[0.84,0.12,0.84]} c="#d4a458"/>
        <Box p={[0,0.21,0]}   s={[0.62,0.14,0.62]} c="#c89848"/>
        <Box p={[0,0.37,0]}   s={[0.42,0.14,0.42]} c="#d4a458"/>
        {/* 4 corner lotus-bud towers — gilded sandstone */}
        {([[-0.2,-0.2],[0.2,-0.2],[-0.2,0.2],[0.2,0.2]] as [number,number][]).map(([x,z],i)=>(
          <group key={i}>
            <Cyl  p={[x,0.55,z]}  rt={0.052} rb={0.068} h={0.36} seg={16} c="#c89848" M={MatSand}/>
            <Cyl  p={[x,0.74,z]}  rt={0.04}  rb={0.052} h={0.22} seg={16} c="#d4a458" M={MatSand}/>
            <Cone p={[x,0.87,z]}  r={0.04}   h={0.14}   seg={16} c="#d4a020" M={MatGold}/>
          </group>
        ))}
        {/* Central tower — tallest */}
        <Cyl  p={[0,0.55,0]}  rt={0.09} rb={0.12}  h={0.44} seg={20} c="#c89848" M={MatSand}/>
        <Cyl  p={[0,0.81,0]}  rt={0.065} rb={0.09} h={0.3}  seg={20} c="#d4a458" M={MatSand}/>
        <Cyl  p={[0,1.0,0]}   rt={0.04} rb={0.065} h={0.22} seg={16} c="#c89848" M={MatSand}/>
        <Cone p={[0,1.14,0]}  r={0.04}  h={0.16}   seg={16} c="#d4a020" M={MatGold}/>
      </Lm>

      {/* ── Borobudur ─────────────────────────────────────────────────────────── */}
      <Lm p={L.borobudur} info={INFO.borobudur} mk="borobudur">
        {/* 4 square terraces */}
        <Box p={[0,0.05,0]}  s={[0.8,0.1,0.8]}    c="#a8a090"/>
        <Box p={[0,0.18,0]}  s={[0.64,0.14,0.64]} c="#b0a898"/>
        <Box p={[0,0.32,0]}  s={[0.5,0.14,0.5]}   c="#a8a090"/>
        <Box p={[0,0.46,0]}  s={[0.38,0.14,0.38]} c="#b0a898"/>
        {/* 3 circular terraces */}
        <Cyl p={[0,0.6,0]}   rt={0.22} rb={0.22}  h={0.1}  seg={24} c="#a0988a"/>
        <Cyl p={[0,0.72,0]}  rt={0.16} rb={0.16}  h={0.1}  seg={24} c="#a8a090"/>
        <Cyl p={[0,0.84,0]}  rt={0.1}  rb={0.1}   h={0.1}  seg={24} c="#a0988a"/>
        {/* Bell stupas (perforated) on circular tiers */}
        {([
          {r:0.17, n:8, y:0.66},
          {r:0.12, n:6, y:0.78},
          {r:0.07, n:4, y:0.9},
        ] as {r:number;n:number;y:number}[]).flatMap(({r,n,y},ti)=>
          Array.from({length:n},(_,i)=>{
            const a=i*Math.PI*2/n;
            return <Ball key={`${ti}-${i}`} p={[Math.sin(a)*r, y, Math.cos(a)*r]} r={0.038} c="#bcb4a0"/>;
          })
        )}
        {/* Central main stupa */}
        <Ball p={[0,1.0,0]}  r={0.075} c="#c8c0b0"/>
        <Cone p={[0,1.1,0]}  r={0.018} h={0.08} seg={8} c="#d8d0c0"/>
      </Lm>

      {/* ── Tokyo Skytree ─────────────────────────────────────────────────────── */}
      <Lm p={L.tokyoSkytree} info={INFO.tokyoSkytree} mk="tokyoSkytree">
        {/* Tripod base — 3 triangular legs */}
        {([0,120,240] as number[]).map((deg,i)=>{
          const a=deg*Math.PI/180;
          return <Box key={i} p={[Math.sin(a)*0.13,0.12,Math.cos(a)*0.13]} s={[0.07,0.24,0.07]} c="#4888b8"/>;
        })}
        {/* Base ring connector */}
        <Cyl p={[0,0.24,0]}  rt={0.15} rb={0.2}  h={0.08} seg={24} c="#3878a8"/>
        {/* Tapering main shaft */}
        <Cyl p={[0,0.7,0]}   rt={0.04} rb={0.14} h={0.92} seg={24} c="#40a0e8"/>
        {/* Lower observation deck torus */}
        <mesh position={[0,0.6,0]}>
          <torusGeometry args={[0.11,0.04,18,60]}/>
          <Mat c="#2870c0"/>
        </mesh>
        {/* Upper observation deck torus */}
        <mesh position={[0,0.78,0]}>
          <torusGeometry args={[0.075,0.03,16,48]}/>
          <Mat c="#2060b0"/>
        </mesh>
        {/* Broadcast antenna mast */}
        <Cyl p={[0,1.2,0]}   rt={0.006} rb={0.04} h={0.44} seg={8} c="#90c8f8"/>
        <Ball p={[0,1.44,0]} r={0.018} c="#c0e8ff"/>
      </Lm>

      {/* ── Great Pyramid of Giza ─────────────────────────────────────────────── */}
      <Lm p={L.pyramidGiza} s={0.125} info={INFO.pyramidGiza}>
        {/* Desert plateau */}
        <Box p={[0,0.03,0]} s={[1.4,0.06,1.0]} c="#d8c060" M={MatSand}/>
        {/* Great Pyramid of Khufu — Tura limestone casing */}
        <mesh position={[0,0.41,0]}>
          <coneGeometry args={[0.54,0.78,4]}/>
          <MatSand c="#f0d848"/>
        </mesh>
        {/* Pyramid of Khafre */}
        <mesh position={[0.6,0.32,0.3]}>
          <coneGeometry args={[0.4,0.62,4]}/>
          <MatSand c="#e8cc40"/>
        </mesh>
        {/* Pyramid of Menkaure */}
        <mesh position={[-0.52,0.22,0.38]}>
          <coneGeometry args={[0.28,0.42,4]}/>
          <MatSand c="#e8c838"/>
        </mesh>
        {/* Great Sphinx silhouette */}
        <Box p={[0.18,0.1,-0.3]}  s={[0.22,0.1,0.14]} c="#d4b840" M={MatSand}/>
        <Ball p={[0.28,0.17,-0.3]} r={0.05} c="#d4b840" M={MatSand}/>
      </Lm>

      {/* ── Table Mountain ────────────────────────────────────────────────────── */}
      <Lm p={L.tableMountain} info={INFO.tableMountain} mk="tableMountain">
        {/* Main mountain body */}
        <Cone p={[0,0.2,0]}      r={0.6} h={0.4} seg={8}  c="#8a7060"/>
        {/* Flat table top */}
        <Box p={[0,0.42,0]}      s={[0.84,0.04,0.38]}      c="#9a8070"/>
        {/* Devil's Peak (right) */}
        <Cone p={[0.48,0.3,0]}   r={0.2} h={0.3} seg={8}   c="#7a6050"/>
        {/* Lion's Head (left, rounded) */}
        <Ball p={[-0.44,0.26,0]} r={0.18} c="#806858"/>
        <Cone p={[-0.44,0.2,0]}  r={0.2} h={0.2} seg={8}   c="#806858"/>
        {/* Orographic cloud (tablecloth) */}
        <Box p={[0,0.47,0]}      s={[0.72,0.04,0.32]}      c="#e8f0ff"/>
      </Lm>

      {/* ── Statue of Liberty ─────────────────────────────────────────────────── */}
      <Lm p={L.statueLiberty} info={INFO.statueLiberty} mk="statueLiberty">
        {/* Star-fort pedestal — granite */}
        <Box p={[0,0.08,0]}    s={[0.22,0.16,0.22]}   c="#a0b0a8" M={MatStone}/>
        {/* Robe — oxidised copper patina */}
        <Cyl p={[0,0.3,0]}     rt={0.07} rb={0.11}    h={0.32} seg={16} c="#58d0b0" M={MatPatina}/>
        {/* Upper torso */}
        <Cyl p={[0,0.5,0]}     rt={0.065} rb={0.07}   h={0.2}  seg={16} c="#50c8a8" M={MatPatina}/>
        {/* Head */}
        <Ball p={[0,0.69,0]}   r={0.088} c="#60d8b8" M={MatPatina}/>
        {/* Crown — 7 rays */}
        {Array.from({length:7},(_,i)=>{
          const a=i*Math.PI*2/7;
          return <Box key={i} p={[Math.sin(a)*0.08,0.77,Math.cos(a)*0.08]} s={[0.018,0.1,0.018]} c="#50d0a8" M={MatPatina}/>;
        })}
        {/* Right arm raised — holding torch */}
        <Box p={[0.13,0.6,0]}    s={[0.04,0.2,0.04]}  c="#58d0b0" M={MatPatina}/>
        <Cyl p={[0.13,0.76,0]}   rt={0.02} rb={0.02}  h={0.14} seg={10} c="#58d0b0" M={MatPatina}/>
        <Ball p={[0.13,0.85,0]}  r={0.04} c="#ffe840" M={MatGold}/>
        {/* Left arm with tablet */}
        <Box p={[-0.09,0.52,0.1]} s={[0.04,0.16,0.04]} c="#50c8a8" M={MatPatina}/>
        <Box p={[-0.09,0.44,0.12]} s={[0.06,0.1,0.02]} c="#78e0c0" M={MatPatina}/>
      </Lm>

      {/* ── Mount Rushmore ────────────────────────────────────────────────────── */}
      <Lm p={L.mtRushmore} info={INFO.mtRushmore} mk="mtRushmore">
        {/* Mountain mass */}
        <Box p={[0,0.22,0]}   s={[0.82,0.44,0.34]}  c="#b8b0a8"/>
        <Cone p={[-0.22,0.56,0]} r={0.22} h={0.32} seg={8} c="#c0b8b0"/>
        <Cone p={[0.24,0.5,0]}  r={0.18} h={0.26} seg={8} c="#b8b0a8"/>
        {/* 4 carved presidential heads */}
        {([-0.27,-0.09,0.09,0.27] as number[]).map((x,i)=>(
          <group key={i}>
            <Ball p={[x,0.44,0.17]}  r={0.072} c="#c8c0b8"/>
            {/* Face features */}
            <Box  p={[x,0.39,0.24]}  s={[0.09,0.04,0.02]} c="#b8b0a8"/>
          </group>
        ))}
        {/* Talus slope below */}
        <Box p={[0,0.06,0]}   s={[0.8,0.12,0.36]}  c="#a8a098"/>
      </Lm>

      {/* ── Golden Gate Bridge ────────────────────────────────────────────────── */}
      <Lm p={L.goldenGate} info={INFO.goldenGate} mk="goldenGate">
        {/* Road deck — International Orange painted steel */}
        <Box p={[0,0.06,0]}    s={[0.82,0.04,0.13]}  c="#ff5820" M={MatMetal}/>
        {/* Tower 1 — left H-frame */}
        <Box p={[-0.3,0.38,0.04]}  s={[0.06,0.62,0.06]} c="#ff5820" M={MatMetal}/>
        <Box p={[-0.3,0.38,-0.04]} s={[0.06,0.62,0.06]} c="#ff5820" M={MatMetal}/>
        <Box p={[-0.3,0.26,0]}     s={[0.06,0.04,0.14]} c="#f04818" M={MatMetal}/>
        <Box p={[-0.3,0.48,0]}     s={[0.06,0.04,0.14]} c="#f04818" M={MatMetal}/>
        {/* Tower 2 — right H-frame */}
        <Box p={[0.3,0.38,0.04]}   s={[0.06,0.62,0.06]} c="#ff5820" M={MatMetal}/>
        <Box p={[0.3,0.38,-0.04]}  s={[0.06,0.62,0.06]} c="#ff5820" M={MatMetal}/>
        <Box p={[0.3,0.26,0]}      s={[0.06,0.04,0.14]} c="#f04818" M={MatMetal}/>
        <Box p={[0.3,0.48,0]}      s={[0.06,0.04,0.14]} c="#f04818" M={MatMetal}/>
        {/* Main catenary cables — high-strength steel wire rope */}
        <mesh position={[-0.225,0.49,0.05]} rotation={[0,0,0.52] as any}>
          <boxGeometry args={[0.02,0.24,0.012]}/>
          <MatMetal c="#e04010"/>
        </mesh>
        <mesh position={[-0.075,0.32,0.05]} rotation={[0,0,0.74] as any}>
          <boxGeometry args={[0.02,0.24,0.012]}/>
          <MatMetal c="#e04010"/>
        </mesh>
        <mesh position={[0.075,0.32,0.05]} rotation={[0,0,-0.74] as any}>
          <boxGeometry args={[0.02,0.24,0.012]}/>
          <MatMetal c="#e04010"/>
        </mesh>
        <mesh position={[0.225,0.49,0.05]} rotation={[0,0,-0.52] as any}>
          <boxGeometry args={[0.02,0.24,0.012]}/>
          <MatMetal c="#e04010"/>
        </mesh>
        <mesh position={[-0.225,0.49,-0.05]} rotation={[0,0,0.52] as any}>
          <boxGeometry args={[0.02,0.24,0.012]}/>
          <MatMetal c="#e04010"/>
        </mesh>
        <mesh position={[-0.075,0.32,-0.05]} rotation={[0,0,0.74] as any}>
          <boxGeometry args={[0.02,0.24,0.012]}/>
          <MatMetal c="#e04010"/>
        </mesh>
        <mesh position={[0.075,0.32,-0.05]} rotation={[0,0,-0.74] as any}>
          <boxGeometry args={[0.02,0.24,0.012]}/>
          <MatMetal c="#e04010"/>
        </mesh>
        <mesh position={[0.225,0.49,-0.05]} rotation={[0,0,-0.52] as any}>
          <boxGeometry args={[0.02,0.24,0.012]}/>
          <MatMetal c="#e04010"/>
        </mesh>
        {/* Vertical suspender hangers */}
        {([-0.18,-0.09,0,0.09,0.18] as number[]).map((x,i)=>(
          <Box key={i} p={[x,0.14,0.05]} s={[0.008,0.16,0.008]} c="#e04010"/>
        ))}
      </Lm>

      {/* ── Grand Canyon ──────────────────────────────────────────────────────── */}
      <Lm p={L.grandCanyon} info={INFO.grandCanyon} mk="grandCanyon">
        {/* Colourful strata layers */}
        <Box p={[0,0.24,0]}     s={[0.84,0.08,0.4]}  c="#e87038"/>
        <Box p={[0,0.17,0]}     s={[0.84,0.08,0.4]}  c="#f08850"/>
        <Box p={[0,0.11,0]}     s={[0.84,0.06,0.4]}  c="#d86030"/>
        <Box p={[0,0.06,0]}     s={[0.84,0.06,0.4]}  c="#b85828"/>
        {/* Canyon chasm */}
        <Box p={[0,0.14,0]}     s={[0.18,0.26,0.44]} c="#401808"/>
        {/* Colorado River (thin blue strip) */}
        <Box p={[0,0.02,0]}     s={[0.1,0.04,0.44]}  c="#3080c0"/>
        {/* Mesa plateaux */}
        <Box p={[-0.36,0.29,0]} s={[0.2,0.04,0.4]}   c="#f8a060"/>
        <Box p={[0.36,0.29,0]}  s={[0.2,0.04,0.4]}   c="#f8a060"/>
      </Lm>

      {/* ── Niagara Falls ─────────────────────────────────────────────────────── */}
      <Lm p={L.niagaraFalls} info={INFO.niagaraFalls}>
        {/* Horseshoe cliff top */}
        <Box p={[0,0.36,0]}       s={[0.74,0.06,0.14]} c="#6898a8"/>
        <Box p={[-0.29,0.36,0.1]} s={[0.14,0.06,0.12]} c="#6898a8"/>
        <Box p={[0.29,0.36,0.1]}  s={[0.14,0.06,0.12]} c="#6898a8"/>
        {/* Horseshoe Falls curtain */}
        <Box p={[0,0.19,0.04]}    s={[0.66,0.3,0.1]}   c="#70c8e8"/>
        <Box p={[-0.25,0.19,0.12]} s={[0.12,0.3,0.12]}  c="#68c0e0"/>
        <Box p={[0.25,0.19,0.12]}  s={[0.12,0.3,0.12]}  c="#68c0e0"/>
        {/* American Falls (side) */}
        <Box p={[0.38,0.23,0]}    s={[0.04,0.22,0.1]}  c="#78d0f0"/>
        {/* Mist pool */}
        <Ball p={[0,0.04,0.18]}   r={0.17} c="#c8e8f8"/>
        <Ball p={[-0.2,0.06,0.16]} r={0.1} c="#d0eeff"/>
        <Ball p={[0.2,0.06,0.16]}  r={0.1} c="#d0eeff"/>
      </Lm>

      {/* ── Iguazu Falls ──────────────────────────────────────────────────────── */}
      <Lm p={L.iguazuFalls} info={INFO.iguazuFalls} mk="iguazuFalls">
        {/* U-shaped cliff — Devil's Throat */}
        <Box p={[0,0.32,0]}        s={[0.86,0.06,0.14]} c="#50a060"/>
        <Box p={[-0.33,0.32,0.1]}  s={[0.14,0.06,0.12]} c="#50a060"/>
        <Box p={[0.33,0.32,0.1]}   s={[0.14,0.06,0.12]} c="#50a060"/>
        {/* Multi-drop water curtain */}
        <Box p={[0,0.15,0.04]}     s={[0.74,0.3,0.1]}   c="#60c8e0"/>
        <Box p={[-0.29,0.15,0.1]}  s={[0.12,0.3,0.1]}   c="#58c0d8"/>
        <Box p={[0.29,0.15,0.1]}   s={[0.12,0.3,0.1]}   c="#58c0d8"/>
        {/* Jungle islands in flow */}
        <Ball p={[-0.12,0.28,0.02]} r={0.05} c="#306030"/>
        <Ball p={[0.14,0.29,0.02]}  r={0.04} c="#408040"/>
        {/* Spray mist */}
        <Ball p={[0,0.04,0.18]}    r={0.2}  c="#c0e8f8"/>
      </Lm>

      {/* ── Galápagos Islands ─────────────────────────────────────────────────── */}
      <Lm p={L.galapagos} info={INFO.galapagos} mk="galapagos">
        {/* Ocean base */}
        <Box p={[0,0.01,0]}         s={[0.76,0.02,0.6]}  c="#1880b8"/>
        {/* Isabela — largest island, shield volcano */}
        <Ball p={[0,0.09,0]}        r={0.22} c="#6a5848"/>
        <Cone p={[0,0.28,0]}        r={0.16} h={0.24} seg={8} c="#5a4838"/>
        <Ball p={[0,0.39,0]}        r={0.06} c="#382818"/>
        {/* Santa Cruz — medium, dense vegetation */}
        <Ball p={[0.3,0.07,0.1]}    r={0.14} c="#7a7858"/>
        <Cone p={[0.3,0.2,0.1]}     r={0.1}  h={0.16} seg={8} c="#6a5848"/>
        {/* Fernandina — active volcano, small */}
        <Ball p={[-0.24,0.05,-0.12]} r={0.1}  c="#786060"/>
        <Cone p={[-0.24,0.14,-0.12]} r={0.07} h={0.12} seg={8} c="#684848"/>
        <Ball p={[-0.24,0.19,-0.12]} r={0.028} c="#301010"/>
      </Lm>

      {/* ── Plitvice Lakes ────────────────────────────────────────────────────── */}
      <Lm p={L.plitviceLakes} info={INFO.plitviceLakes}>
        {/* Forest floor */}
        <Box p={[0,0.02,0]}          s={[0.66,0.04,0.5]}  c="#408040"/>
        {/* Cascading travertine lake terraces */}
        <Box p={[0,0.06,0]}          s={[0.54,0.04,0.4]}  c="#30c8e8"/>
        <Box p={[0.04,0.13,0.04]}    s={[0.4,0.06,0.3]}   c="#28b8d8"/>
        <Box p={[0.08,0.21,0.08]}    s={[0.3,0.06,0.22]}  c="#38c8e8"/>
        <Box p={[0.12,0.29,0.12]}    s={[0.2,0.06,0.16]}  c="#28b8d8"/>
        <Box p={[0.16,0.37,0.16]}    s={[0.12,0.06,0.1]}  c="#30c0e0"/>
        {/* Waterfalls between levels */}
        <Box p={[-0.06,0.1,0.16]}    s={[0.06,0.1,0.06]}  c="#60d8f0"/>
        <Box p={[-0.02,0.18,0.12]}   s={[0.06,0.08,0.06]} c="#60d8f0"/>
        <Box p={[0.04,0.26,0.1]}     s={[0.05,0.07,0.05]} c="#60d8f0"/>
        {/* Forest trees */}
        <Cone p={[-0.24,0.14,0]}     r={0.06} h={0.18} seg={6} c="#308030"/>
        <Cone p={[0.22,0.08,-0.12]}  r={0.05} h={0.15} seg={6} c="#308030"/>
      </Lm>

      {/* ── Swiss Alps ────────────────────────────────────────────────────────── */}
      <Lm p={L.swissAlps} info={INFO.swissAlps}>
        {/* Valley floor with green meadows */}
        <Box p={[0,0.04,0]}     s={[0.76,0.08,0.44]}  c="#88b058"/>
        {/* Matterhorn (iconic pyramid peak) */}
        <Cone p={[-0.22,0.38,0]} r={0.2} h={0.68} seg={4} c="#8888a0"/>
        {/* Eiger */}
        <Cone p={[0.2,0.3,0]}    r={0.18} h={0.52} seg={6} c="#9090a8"/>
        {/* Jungfrau */}
        <Cone p={[0,0.35,0.12]}  r={0.16} h={0.46} seg={6} c="#9898b0"/>
        {/* Snow caps */}
        <Cone p={[-0.22,0.68,0]} r={0.09} h={0.16} seg={4} c="#eef6ff"/>
        <Cone p={[0.2,0.56,0]}   r={0.08} h={0.13} seg={6} c="#eef6ff"/>
        <Cone p={[0,0.6,0.12]}   r={0.07} h={0.12} seg={6} c="#eef6ff"/>
        {/* Glacier */}
        <Box p={[0.02,0.1,0.06]} s={[0.16,0.06,0.2]}  c="#d8eeff"/>
      </Lm>

      {/* ── Mount Everest ─────────────────────────────────────────────────────── */}
      <Lm p={L.mtEverest} s={0.125} info={INFO.mtEverest}>
        {/* Himalayan ridge base */}
        <Box p={[0,0.14,0]}         s={[0.84,0.28,0.4]}  c="#807090"/>
        {/* Everest main peak — classic pyramid */}
        <Cone p={[0,0.56,0]}        r={0.28} h={0.76} seg={6} c="#908898"/>
        {/* Lhotse */}
        <Cone p={[0.3,0.42,0.14]}   r={0.18} h={0.52} seg={6} c="#807080"/>
        {/* Nuptse */}
        <Cone p={[-0.28,0.36,0.12]} r={0.16} h={0.44} seg={6} c="#887888"/>
        {/* Changtse (north peak) */}
        <Cone p={[-0.1,0.34,-0.18]} r={0.14} h={0.38} seg={6} c="#806878"/>
        {/* Summit snow / death zone */}
        <Cone p={[0,0.88,0]}        r={0.11} h={0.2}  seg={6} c="#e8f0ff"/>
        <Cone p={[0.3,0.69,0.14]}   r={0.06} h={0.1}  seg={6} c="#e8f0ff"/>
        {/* Snow plume */}
        <Box p={[0.06,1.0,0]}       s={[0.12,0.04,0.06]} c="#ffffff"/>
      </Lm>

      {/* ── Ha Long Bay ───────────────────────────────────────────────────────── */}
      <Lm p={L.haLongBay} info={INFO.haLongBay}>
        {/* Emerald/jade water */}
        <Box p={[0,0.02,0]}          s={[0.8,0.04,0.58]}  c="#1090b8"/>
        {/* Karst limestone pillars — varied heights and widths */}
        <Cyl p={[-0.24,0.36,0.06]}   rt={0.055} rb={0.1}  h={0.72} seg={10} c="#687890"/>
        <Cyl p={[0.06,0.26,-0.04]}   rt={0.07}  rb={0.12} h={0.52} seg={10} c="#6a7888"/>
        <Cyl p={[0.24,0.42,0.04]}    rt={0.05}  rb={0.09} h={0.84} seg={10} c="#788090"/>
        <Cyl p={[-0.06,0.46,0.16]}   rt={0.044} rb={0.08} h={0.92} seg={10} c="#788090"/>
        <Cyl p={[0,0.2,-0.16]}       rt={0.06}  rb={0.1}  h={0.4}  seg={10} c="#686880"/>
        <Cyl p={[0.14,0.18,0.2]}     rt={0.04}  rb={0.07} h={0.36} seg={10} c="#708090"/>
        {/* Jungle vegetation on pillar tops */}
        <Ball p={[-0.24,0.74,0.06]}  r={0.054} c="#306030"/>
        <Ball p={[0.24,0.86,0.04]}   r={0.048} c="#306030"/>
        <Ball p={[-0.06,0.94,0.16]}  r={0.042} c="#406040"/>
        <Ball p={[0.06,0.52,-0.04]}  r={0.038} c="#386038"/>
      </Lm>

      {/* ── Victoria Falls ────────────────────────────────────────────────────── */}
      <Lm p={L.victoriaFalls} info={INFO.victoriaFalls} mk="victoriaFalls">
        {/* Clifftop plateau — widest waterfall on earth */}
        <Box p={[0,0.42,0]}       s={[0.92,0.07,0.14]}  c="#58a858"/>
        {/* Water curtain */}
        <Box p={[0,0.22,0.02]}    s={[0.88,0.38,0.1]}   c="#5098d8"/>
        {/* Gorge wall opposite */}
        <Box p={[0,0.22,0.16]}    s={[0.9,0.4,0.06]}    c="#806050"/>
        {/* Boiling pot at base */}
        <Ball p={[0,0.06,0.18]}   r={0.2}  c="#b0d8f0"/>
        <Ball p={[-0.22,0.1,0.16]} r={0.12} c="#c0e0f8"/>
        <Ball p={[0.22,0.1,0.16]}  r={0.12} c="#c0e0f8"/>
        {/* Spray rising up */}
        <Ball p={[0,0.52,0.1]}    r={0.1}  c="#d8ecff"/>
      </Lm>

      {/* ── Great Barrier Reef ────────────────────────────────────────────────── */}
      <Lm p={L.greatBarrierReef} info={INFO.greatBarrierReef}>
        {/* Coral sea */}
        <Box p={[0,0.02,0]}          s={[0.94,0.04,0.54]}  c="#0888c0"/>
        {/* Staghorn coral */}
        <Ball p={[-0.3,0.14,0.04]}   r={0.1}   c="#ff4820"/>
        <Ball p={[0.08,0.15,0.06]}   r={0.13}  c="#ff9030"/>
        {/* Brain coral */}
        <Ball p={[0.3,0.11,0.06]}    r={0.09}  c="#e8a028"/>
        {/* Table coral */}
        <Box p={[-0.08,0.1,0.1]}     s={[0.16,0.04,0.14]} c="#30d888"/>
        {/* Sea fan / soft coral */}
        <Ball p={[0.18,0.1,-0.1]}    r={0.1}   c="#ff6080"/>
        <Ball p={[-0.2,0.09,-0.08]}  r={0.07}  c="#40d8e0"/>
        {/* Clown fish habitat (orange) */}
        <Ball p={[0.36,0.09,-0.08]}  r={0.07}  c="#f8a020"/>
        {/* Blue tang habitat */}
        <Ball p={[-0.36,0.08,0.1]}   r={0.06}  c="#30c0d8"/>
        {/* Sea anemone */}
        <Ball p={[0,0.12,0.14]}      r={0.08}  c="#e070d0"/>
      </Lm>

      {/* ── Milford Sound ─────────────────────────────────────────────────────── */}
      <Lm p={L.milfordSound} info={INFO.milfordSound}>
        {/* Fiord water */}
        <Box p={[0,0.02,0]}        s={[0.66,0.04,0.34]}  c="#4070b8"/>
        {/* Mitre Peak — iconic triangular spire */}
        <Cone p={[-0.14,0.5,0]}    r={0.2}  h={1.0} seg={6} c="#6070a0"/>
        <Cone p={[-0.14,0.88,0]}   r={0.07} h={0.16} seg={6} c="#ddeeff"/>
        {/* Companion peaks */}
        <Cone p={[0.22,0.34,0]}    r={0.18} h={0.68} seg={6} c="#5868a0"/>
        <Cone p={[0.04,0.28,0.12]} r={0.15} h={0.58} seg={6} c="#6070a0"/>
        {/* Stirling Falls — thin white stripe */}
        <Box p={[-0.06,0.3,0.15]}  s={[0.022,0.48,0.022]} c="#aaccee"/>
        {/* Lady Bowen Falls */}
        <Box p={[0.1,0.24,0.14]}   s={[0.016,0.36,0.016]} c="#aaccee"/>
        {/* Mist at waterfall base */}
        <Ball p={[-0.06,0.06,0.18]} r={0.06} c="#c8e0f8"/>
        <Ball p={[0.1,0.06,0.16]}   r={0.05} c="#c8e0f8"/>
      </Lm>

      {/* ══ US State Landmarks ══════════════════════════════════════════ */}
      {/* alabamaRocket */}
      <Lm p={L.alabamaRocket} info={INFO.alabamaRocket}>
        <mesh position={[0,0.08,0]}><cylinderGeometry args={[0.1,0.13,0.16,8]}/><meshStandardMaterial color="#cc4422" roughness={0.5}/></mesh>
        <mesh position={[0,0.35,0]}><cylinderGeometry args={[0.06,0.1,0.38,8]}/><meshStandardMaterial color="#cc4422"/></mesh>
        <mesh position={[0,0.56,0]}><cylinderGeometry args={[0.09,0.06,0.06,8]}/><meshStandardMaterial color="#cc4422"/></mesh>
        <mesh position={[0,0.72,0]}><coneGeometry args={[0.04,0.18,8]}/><meshStandardMaterial color="#cc4422"/></mesh>
      </Lm>
      {/* alaskaDenali */}
      <Lm p={L.alaskaDenali} info={INFO.alaskaDenali}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#8899bb" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#8899bb" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* arkansasCrystal */}
      <Lm p={L.arkansasCrystal} info={INFO.arkansasCrystal}>
        <mesh position={[0,0.06,0]} scale={[0.7,0.12,0.7]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#6688aa" roughness={0.6}/></mesh>
        <mesh position={[0,0.2,0]} scale={[0.5,0.2,0.5]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#6688aa"/></mesh>
        <mesh position={[0,0.38,0]}><sphereGeometry args={[0.22,16,12]}/><meshStandardMaterial color="#6688aa" roughness={0.3} metalness={0.1}/></mesh>
      </Lm>
      {/* californiaYosemite */}
      <Lm p={L.californiaYosemite} info={INFO.californiaYosemite}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#5a8040" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#5a8040" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* coloradoRocky */}
      <Lm p={L.coloradoRocky} info={INFO.coloradoRocky}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#7080a8" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#7080a8" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* connecticutMark */}
      <Lm p={L.connecticutMark} info={INFO.connecticutMark}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#8855aa" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#8855aa"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#8855aa"/></mesh>
      </Lm>
      {/* delawareCape */}
      <Lm p={L.delawareCape} info={INFO.delawareCape}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#3399cc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* floridaKSC */}
      <Lm p={L.floridaKSC} info={INFO.floridaKSC}>
        <mesh position={[0,0.08,0]}><cylinderGeometry args={[0.1,0.13,0.16,8]}/><meshStandardMaterial color="#aaaacc" roughness={0.5}/></mesh>
        <mesh position={[0,0.35,0]}><cylinderGeometry args={[0.06,0.1,0.38,8]}/><meshStandardMaterial color="#aaaacc"/></mesh>
        <mesh position={[0,0.56,0]}><cylinderGeometry args={[0.09,0.06,0.06,8]}/><meshStandardMaterial color="#aaaacc"/></mesh>
        <mesh position={[0,0.72,0]}><coneGeometry args={[0.04,0.18,8]}/><meshStandardMaterial color="#aaaacc"/></mesh>
      </Lm>
      {/* georgiaStone */}
      <Lm p={L.georgiaStone} info={INFO.georgiaStone}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#888888" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#888888" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* hawaiiDiamond */}
      <Lm p={L.hawaiiDiamond} info={INFO.hawaiiDiamond}>
        <mesh position={[0,0.16,0]}><coneGeometry args={[0.35,0.38,8]}/><meshStandardMaterial color="#884422" roughness={0.8}/></mesh>
        <mesh position={[0,0.38,0]}><coneGeometry args={[0.22,0.26,8]}/><meshStandardMaterial color="#884422" roughness={0.7}/></mesh>
        <mesh position={[0,0.5,0]}><cylinderGeometry args={[0.09,0.14,0.06,8]}/><meshStandardMaterial color="#cc4400"/></mesh>
      </Lm>
      {/* idahoCraters */}
      <Lm p={L.idahoCraters} info={INFO.idahoCraters}>
        <mesh position={[0,0.16,0]}><coneGeometry args={[0.35,0.38,8]}/><meshStandardMaterial color="#aa5522" roughness={0.8}/></mesh>
        <mesh position={[0,0.38,0]}><coneGeometry args={[0.22,0.26,8]}/><meshStandardMaterial color="#aa5522" roughness={0.7}/></mesh>
        <mesh position={[0,0.5,0]}><cylinderGeometry args={[0.09,0.14,0.06,8]}/><meshStandardMaterial color="#cc4400"/></mesh>
      </Lm>
      {/* illinoisBean */}
      <Lm p={L.illinoisBean} info={INFO.illinoisBean}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#aabbcc" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#aabbcc"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#aabbcc"/></mesh>
      </Lm>
      {/* indianaSpeedway */}
      <Lm p={L.indianaSpeedway} info={INFO.indianaSpeedway}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc4422" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc4422"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc4422"/></mesh>
      </Lm>
      {/* iowaFields */}
      <Lm p={L.iowaFields} info={INFO.iowaFields}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#669944" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#669944"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#669944"/></mesh>
      </Lm>
      {/* kansasPrairie */}
      <Lm p={L.kansasPrairie} info={INFO.kansasPrairie}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#88aa55" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#88aa55"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#88aa55"/></mesh>
      </Lm>
      {/* kentuckyMammoth */}
      <Lm p={L.kentuckyMammoth} info={INFO.kentuckyMammoth}>
        <mesh position={[-0.18,0.2,0]} scale={[0.09,0.4,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#886644" roughness={0.7}/></mesh>
        <mesh position={[ 0.18,0.2,0]} scale={[0.09,0.4,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#886644"/></mesh>
        <mesh position={[0,0.44,0]} scale={[0.45,0.1,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#886644"/></mesh>
      </Lm>
      {/* louisianaFrench */}
      <Lm p={L.louisianaFrench} info={INFO.louisianaFrench}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc7733" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc7733"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc7733"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc7733"/></mesh>
      </Lm>
      {/* maineAcadia */}
      <Lm p={L.maineAcadia} info={INFO.maineAcadia}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#778899" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#778899" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* marylandFort */}
      <Lm p={L.marylandFort} info={INFO.marylandFort}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#aa8844" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#aa8844"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#aa8844"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#aa8844"/></mesh>
      </Lm>
      {/* massFreedom */}
      <Lm p={L.massFreedom} info={INFO.massFreedom}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc5533" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc5533"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc5533"/></mesh>
      </Lm>
      {/* michiganPictured */}
      <Lm p={L.michiganPictured} info={INFO.michiganPictured}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#4488cc" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#4488cc"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#4488cc"/></mesh>
      </Lm>
      {/* minnesotaMall */}
      <Lm p={L.minnesotaMall} info={INFO.minnesotaMall}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#4466aa" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#4466aa"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#4466aa"/></mesh>
      </Lm>
      {/* mississippiNatch */}
      <Lm p={L.mississippiNatch} info={INFO.mississippiNatch}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#887766" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#887766"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#887766"/></mesh>
      </Lm>
      {/* missouriArch */}
      <Lm p={L.missouriArch} info={INFO.missouriArch}>
        <mesh position={[-0.18,0.2,0]} scale={[0.09,0.4,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#88aabb" roughness={0.7}/></mesh>
        <mesh position={[ 0.18,0.2,0]} scale={[0.09,0.4,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#88aabb"/></mesh>
        <mesh position={[0,0.44,0]} scale={[0.45,0.1,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#88aabb"/></mesh>
      </Lm>
      {/* montanaGlacier */}
      <Lm p={L.montanaGlacier} info={INFO.montanaGlacier}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#aaccdd" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#aaccdd" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* nebraskaChimney */}
      <Lm p={L.nebraskaChimney} info={INFO.nebraskaChimney}>
        <mesh position={[0,0.04,0]} scale={[0.14,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9966" roughness={0.6}/></mesh>
        <mesh position={[0,0.28,0]}><cylinderGeometry args={[0.04,0.08,0.44,8]}/><meshStandardMaterial color="#cc9966"/></mesh>
        <mesh position={[0,0.54,0]}><coneGeometry args={[0.04,0.14,8]}/><meshStandardMaterial color="#cc9966" metalness={0.3}/></mesh>
      </Lm>
      {/* nevadaVegas */}
      <Lm p={L.nevadaVegas} info={INFO.nevadaVegas}>
        <mesh position={[0,0.08,0]}><cylinderGeometry args={[0.1,0.13,0.16,8]}/><meshStandardMaterial color="#ffcc22" roughness={0.5}/></mesh>
        <mesh position={[0,0.35,0]}><cylinderGeometry args={[0.06,0.1,0.38,8]}/><meshStandardMaterial color="#ffcc22"/></mesh>
        <mesh position={[0,0.56,0]}><cylinderGeometry args={[0.09,0.06,0.06,8]}/><meshStandardMaterial color="#ffcc22"/></mesh>
        <mesh position={[0,0.72,0]}><coneGeometry args={[0.04,0.18,8]}/><meshStandardMaterial color="#ffcc22" emissive="#ffcc22" emissiveIntensity={0.35}/></mesh>
      </Lm>
      {/* nhWashington */}
      <Lm p={L.nhWashington} info={INFO.nhWashington}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#99aabb" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#99aabb" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* njAtlantic */}
      <Lm p={L.njAtlantic} info={INFO.njAtlantic}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#4466bb" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#4466bb"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#4466bb"/></mesh>
      </Lm>
      {/* nmWhiteSands */}
      <Lm p={L.nmWhiteSands} info={INFO.nmWhiteSands}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#eeeedc" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#eeeedc"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#eeeedc"/></mesh>
      </Lm>
      {/* nyEmpire */}
      <Lm p={L.nyEmpire} info={INFO.nyEmpire}>
        <mesh position={[0,0.08,0]}><cylinderGeometry args={[0.1,0.13,0.16,8]}/><meshStandardMaterial color="#667799" roughness={0.5}/></mesh>
        <mesh position={[0,0.35,0]}><cylinderGeometry args={[0.06,0.1,0.38,8]}/><meshStandardMaterial color="#667799"/></mesh>
        <mesh position={[0,0.56,0]}><cylinderGeometry args={[0.09,0.06,0.06,8]}/><meshStandardMaterial color="#667799"/></mesh>
        <mesh position={[0,0.72,0]}><coneGeometry args={[0.04,0.18,8]}/><meshStandardMaterial color="#667799"/></mesh>
      </Lm>
      {/* ncBlueRidge */}
      <Lm p={L.ncBlueRidge} info={INFO.ncBlueRidge}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#88aa99" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#88aa99" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* ndTheodore */}
      <Lm p={L.ndTheodore} info={INFO.ndTheodore}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#bb9966" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#bb9966" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* ohioRock */}
      <Lm p={L.ohioRock} info={INFO.ohioRock}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#4466aa" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#4466aa"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#4466aa"/></mesh>
      </Lm>
      {/* oklahomaMemorial */}
      <Lm p={L.oklahomaMemorial} info={INFO.oklahomaMemorial}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#886655" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#886655"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#886655"/></mesh>
      </Lm>
      {/* oregonCrater */}
      <Lm p={L.oregonCrater} info={INFO.oregonCrater}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#2266aa" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#2266aa"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#2266aa"/></mesh>
      </Lm>
      {/* paLibertyBell */}
      <Lm p={L.paLibertyBell} info={INFO.paLibertyBell}>
        <mesh position={[0,0.04,0]} scale={[0.14,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#886633" roughness={0.6}/></mesh>
        <mesh position={[0,0.28,0]}><cylinderGeometry args={[0.04,0.08,0.44,8]}/><meshStandardMaterial color="#886633"/></mesh>
        <mesh position={[0,0.54,0]}><coneGeometry args={[0.04,0.14,8]}/><meshStandardMaterial color="#886633" metalness={0.3}/></mesh>
      </Lm>
      {/* riCliffWalk */}
      <Lm p={L.riCliffWalk} info={INFO.riCliffWalk}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#778899" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#778899"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#778899"/></mesh>
      </Lm>
      {/* scFortSumter */}
      <Lm p={L.scFortSumter} info={INFO.scFortSumter}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#886655" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#886655"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#886655"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#886655"/></mesh>
      </Lm>
      {/* tnGraceland */}
      <Lm p={L.tnGraceland} info={INFO.tnGraceland}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#884433" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#884433"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#884433"/></mesh>
      </Lm>
      {/* txAlamo */}
      <Lm p={L.txAlamo} info={INFO.txAlamo}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#ddccaa" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#ddccaa"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#ddccaa"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#ddccaa"/></mesh>
      </Lm>
      {/* utahArches */}
      <Lm p={L.utahArches} info={INFO.utahArches}>
        <mesh position={[-0.18,0.2,0]} scale={[0.09,0.4,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8844" roughness={0.7}/></mesh>
        <mesh position={[ 0.18,0.2,0]} scale={[0.09,0.4,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8844"/></mesh>
        <mesh position={[0,0.44,0]} scale={[0.45,0.1,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8844"/></mesh>
      </Lm>
      {/* vtStowe */}
      <Lm p={L.vtStowe} info={INFO.vtStowe}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#668844" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#668844" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* vaMonticello */}
      <Lm p={L.vaMonticello} info={INFO.vaMonticello}>
        <mesh position={[0,0.06,0]} scale={[0.7,0.12,0.7]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#eeddcc" roughness={0.6}/></mesh>
        <mesh position={[0,0.2,0]} scale={[0.5,0.2,0.5]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#eeddcc"/></mesh>
        <mesh position={[0,0.38,0]}><sphereGeometry args={[0.22,16,12]}/><meshStandardMaterial color="#eeddcc" roughness={0.3} metalness={0.1}/></mesh>
      </Lm>
      {/* waSpaceNeedle */}
      <Lm p={L.waSpaceNeedle} info={INFO.waSpaceNeedle}>
        <mesh position={[0,0.08,0]}><cylinderGeometry args={[0.1,0.13,0.16,8]}/><meshStandardMaterial color="#888888" roughness={0.5}/></mesh>
        <mesh position={[0,0.35,0]}><cylinderGeometry args={[0.06,0.1,0.38,8]}/><meshStandardMaterial color="#888888"/></mesh>
        <mesh position={[0,0.56,0]}><cylinderGeometry args={[0.09,0.06,0.06,8]}/><meshStandardMaterial color="#888888"/></mesh>
        <mesh position={[0,0.72,0]}><coneGeometry args={[0.04,0.18,8]}/><meshStandardMaterial color="#888888"/></mesh>
      </Lm>
      {/* wvNewRiver */}
      <Lm p={L.wvNewRiver} info={INFO.wvNewRiver}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#666688" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#666688"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#666688"/></mesh>
      </Lm>
      {/* wiHouseRock */}
      <Lm p={L.wiHouseRock} info={INFO.wiHouseRock}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#664422" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#664422"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#664422"/></mesh>
      </Lm>
      {/* wyOldFaithful */}
      <Lm p={L.wyOldFaithful} info={INFO.wyOldFaithful}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.12,0.15,0.12,10]}/><meshStandardMaterial color="#888880" roughness={0.8}/></mesh>
        <mesh position={[0,0.28,0]}><cylinderGeometry args={[0.04,0.08,0.32,10]}/><meshStandardMaterial color="#b8e8f8" roughness={0.3} transparent opacity={0.85}/></mesh>
        <mesh position={[0,0.5,0]}><sphereGeometry args={[0.1,10,8]}/><meshStandardMaterial color="#b8e8f8" roughness={0.3} transparent opacity={0.7}/></mesh>
      </Lm>

      {/* ══ France ═══════════════════════════════════════════════════════ */}
      {/* montSaintMichelF */}
      <Lm p={L.montSaintMichelF} info={INFO.montSaintMichelF}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d0c090" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d0c090"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#d0c090"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#d0c090"/></mesh>
      </Lm>
      {/* versaillesF */}
      <Lm p={L.versaillesF} info={INFO.versaillesF} mk="versaillesF">
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#e8d888" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#e8d888"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#e8d888"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#e8d888"/></mesh>
      </Lm>
      {/* notreDameF */}
      <Lm p={L.notreDameF} info={INFO.notreDameF} mk="notreDameF">
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8c0a0" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8c0a0"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c8c0a0"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c8c0a0"/></mesh>
      </Lm>
      {/* niceRiviera */}
      <Lm p={L.niceRiviera} info={INFO.niceRiviera}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#30aacc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* pontDuGard */}
      <Lm p={L.pontDuGard} info={INFO.pontDuGard}>
        <mesh position={[-0.18,0.2,0]} scale={[0.09,0.4,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d4b870" roughness={0.7}/></mesh>
        <mesh position={[ 0.18,0.2,0]} scale={[0.09,0.4,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d4b870"/></mesh>
        <mesh position={[0,0.44,0]} scale={[0.45,0.1,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d4b870"/></mesh>
      </Lm>
      {/* chamonixAlps */}
      <Lm p={L.chamonixAlps} info={INFO.chamonixAlps}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#aabbcc" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#aabbcc" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* carcassonneF */}
      <Lm p={L.carcassonneF} info={INFO.carcassonneF}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8b880" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8b880"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c8b880"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c8b880"/></mesh>
      </Lm>
      {/* chambordF */}
      <Lm p={L.chambordF} info={INFO.chambordF}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#e0d490" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#e0d490"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#e0d490"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#e0d490"/></mesh>
      </Lm>
      {/* bordeauxWine */}
      <Lm p={L.bordeauxWine} info={INFO.bordeauxWine}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#882233" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#882233"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#882233"/></mesh>
      </Lm>
      {/* colmarAlsace */}
      <Lm p={L.colmarAlsace} info={INFO.colmarAlsace}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#dd8844" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#dd8844"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#dd8844"/></mesh>
      </Lm>

      {/* ══ Spain ════════════════════════════════════════════════════════ */}
      {/* alhambra */}
      <Lm p={L.alhambra} info={INFO.alhambra}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c09040" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c09040"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c09040"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c09040"/></mesh>
      </Lm>
      {/* parkGuell */}
      <Lm p={L.parkGuell} info={INFO.parkGuell}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#cc5533" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#cc5533"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#cc5533"/></mesh>
      </Lm>
      {/* sevilleCathedral */}
      <Lm p={L.sevilleCathedral} info={INFO.sevilleCathedral}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c0a050" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c0a050"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c0a050"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c0a050"/></mesh>
      </Lm>
      {/* guggenheimBilbao */}
      <Lm p={L.guggenheimBilbao} info={INFO.guggenheimBilbao}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#8899cc" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#8899cc"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#8899cc"/></mesh>
      </Lm>
      {/* teideVolcano */}
      <Lm p={L.teideVolcano} info={INFO.teideVolcano}>
        <mesh position={[0,0.16,0]}><coneGeometry args={[0.35,0.38,8]}/><meshStandardMaterial color="#884422" roughness={0.8}/></mesh>
        <mesh position={[0,0.38,0]}><coneGeometry args={[0.22,0.26,8]}/><meshStandardMaterial color="#884422" roughness={0.7}/></mesh>
        <mesh position={[0,0.5,0]}><cylinderGeometry args={[0.09,0.14,0.06,8]}/><meshStandardMaterial color="#cc4400"/></mesh>
      </Lm>
      {/* santiagoDeComp */}
      <Lm p={L.santiagoDeComp} info={INFO.santiagoDeComp}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d0c0a0" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d0c0a0"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#d0c0a0"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#d0c0a0"/></mesh>
      </Lm>
      {/* toledoSpain */}
      <Lm p={L.toledoSpain} info={INFO.toledoSpain}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c0a870" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c0a870"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c0a870"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c0a870"/></mesh>
      </Lm>
      {/* ibizaSpain */}
      <Lm p={L.ibizaSpain} info={INFO.ibizaSpain}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#30bbcc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* costaBrava */}
      <Lm p={L.costaBrava} info={INFO.costaBrava}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#2299bb" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* pampalonaFiesta */}
      <Lm p={L.pampalonaFiesta} info={INFO.pampalonaFiesta}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc3322" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc3322"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc3322"/></mesh>
      </Lm>

      {/* ══ Italy ════════════════════════════════════════════════════════ */}
      {/* leaningPisa */}
      <Lm p={L.leaningPisa} info={INFO.leaningPisa}>
        <mesh position={[0,0.08,0]}><cylinderGeometry args={[0.1,0.13,0.16,8]}/><meshStandardMaterial color="#f0e8d0" roughness={0.5}/></mesh>
        <mesh position={[0,0.35,0]}><cylinderGeometry args={[0.06,0.1,0.38,8]}/><meshStandardMaterial color="#f0e8d0"/></mesh>
        <mesh position={[0,0.56,0]}><cylinderGeometry args={[0.09,0.06,0.06,8]}/><meshStandardMaterial color="#f0e8d0"/></mesh>
        <mesh position={[0,0.72,0]}><coneGeometry args={[0.04,0.18,8]}/><meshStandardMaterial color="#f0e8d0"/></mesh>
      </Lm>
      {/* veniceCanals */}
      <Lm p={L.veniceCanals} info={INFO.veniceCanals}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#3388cc" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#3388cc"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#3388cc"/></mesh>
      </Lm>
      {/* amalfiCoast */}
      <Lm p={L.amalfiCoast} info={INFO.amalfiCoast}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#ee8833" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#ee8833"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#ee8833"/></mesh>
      </Lm>
      {/* vaticanCity */}
      <Lm p={L.vaticanCity} info={INFO.vaticanCity}>
        <mesh position={[0,0.06,0]} scale={[0.7,0.12,0.7]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0ecff" roughness={0.6}/></mesh>
        <mesh position={[0,0.2,0]} scale={[0.5,0.2,0.5]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0ecff"/></mesh>
        <mesh position={[0,0.38,0]}><sphereGeometry args={[0.22,16,12]}/><meshStandardMaterial color="#f0ecff" roughness={0.3} metalness={0.1}/></mesh>
      </Lm>
      {/* pompeii */}
      <Lm p={L.pompeii} info={INFO.pompeii}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8b888" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8b888"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c8b888"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c8b888"/></mesh>
      </Lm>
      {/* cinqueTerre */}
      <Lm p={L.cinqueTerre} info={INFO.cinqueTerre}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#ee8844" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#ee8844"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#ee8844"/></mesh>
      </Lm>
      {/* lakeComo */}
      <Lm p={L.lakeComo} info={INFO.lakeComo}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#3399bb" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#3399bb"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#3399bb"/></mesh>
      </Lm>
      {/* dolomites */}
      <Lm p={L.dolomites} info={INFO.dolomites}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#aabbcc" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#aabbcc" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* treviFountain */}
      <Lm p={L.treviFountain} info={INFO.treviFountain}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#d0c890" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#d0c890"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#d0c890"/></mesh>
      </Lm>
      {/* siciliaTemple */}
      <Lm p={L.siciliaTemple} info={INFO.siciliaTemple}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#d4b870" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#d4b870"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#d4b870"/></mesh>
      </Lm>

      {/* ══ United Kingdom ═══════════════════════════════════════════════ */}
      {/* bigBen */}
      <Lm p={L.bigBen} info={INFO.bigBen} mk="bigBen">
        <mesh position={[0,0.08,0]}><cylinderGeometry args={[0.1,0.13,0.16,8]}/><meshStandardMaterial color="#c8b870" roughness={0.5}/></mesh>
        <mesh position={[0,0.35,0]}><cylinderGeometry args={[0.06,0.1,0.38,8]}/><meshStandardMaterial color="#c8b870"/></mesh>
        <mesh position={[0,0.56,0]}><cylinderGeometry args={[0.09,0.06,0.06,8]}/><meshStandardMaterial color="#c8b870"/></mesh>
        <mesh position={[0,0.72,0]}><coneGeometry args={[0.04,0.18,8]}/><meshStandardMaterial color="#c8b870"/></mesh>
      </Lm>
      {/* towerBridge */}
      <Lm p={L.towerBridge} info={INFO.towerBridge} mk="towerBridge">
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#8899aa" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#8899aa"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#8899aa"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#8899aa"/></mesh>
      </Lm>
      {/* edinburghCastle */}
      <Lm p={L.edinburghCastle} info={INFO.edinburghCastle}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#888888" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#888888"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#888888"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#888888"/></mesh>
      </Lm>
      {/* buckinghamPalace */}
      <Lm p={L.buckinghamPalace} info={INFO.buckinghamPalace}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#e8d888" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#e8d888"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#e8d888"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#e8d888"/></mesh>
      </Lm>
      {/* bathRomans */}
      <Lm p={L.bathRomans} info={INFO.bathRomans}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#d4c890" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#d4c890"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#d4c890"/></mesh>
      </Lm>
      {/* giantsCauseway */}
      <Lm p={L.giantsCauseway} info={INFO.giantsCauseway}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#446688" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#446688"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#446688"/></mesh>
      </Lm>
      {/* lakeDistrict */}
      <Lm p={L.lakeDistrict} info={INFO.lakeDistrict}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#5588aa" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#5588aa"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#5588aa"/></mesh>
      </Lm>
      {/* windsorCastle */}
      <Lm p={L.windsorCastle} info={INFO.windsorCastle}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c0b080" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c0b080"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c0b080"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c0b080"/></mesh>
      </Lm>
      {/* hadrianWall */}
      <Lm p={L.hadrianWall} info={INFO.hadrianWall}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#999988" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#999988"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#999988"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#999988"/></mesh>
      </Lm>
      {/* cotswolds */}
      <Lm p={L.cotswolds} info={INFO.cotswolds}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#aa9944" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#aa9944"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#aa9944"/></mesh>
      </Lm>

      {/* ══ Germany ══════════════════════════════════════════════════════ */}
      {/* brandenburgGate */}
      <Lm p={L.brandenburgGate} info={INFO.brandenburgGate}>
        <mesh position={[-0.18,0.2,0]} scale={[0.09,0.4,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d4c080" roughness={0.7}/></mesh>
        <mesh position={[ 0.18,0.2,0]} scale={[0.09,0.4,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d4c080"/></mesh>
        <mesh position={[0,0.44,0]} scale={[0.45,0.1,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d4c080"/></mesh>
      </Lm>
      {/* neuschwanstein */}
      <Lm p={L.neuschwanstein} info={INFO.neuschwanstein} mk="neuschwanstein">
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#e0eeff" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#e0eeff"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#e0eeff"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#e0eeff"/></mesh>
      </Lm>
      {/* cologneGermany */}
      <Lm p={L.cologneGermany} info={INFO.cologneGermany}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#aaaacc" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#aaaacc"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#aaaacc"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#aaaacc"/></mesh>
      </Lm>
      {/* rhineValley */}
      <Lm p={L.rhineValley} info={INFO.rhineValley}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#2266aa" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#2266aa"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#2266aa"/></mesh>
      </Lm>
      {/* blackForest */}
      <Lm p={L.blackForest} info={INFO.blackForest}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#226633" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#226633" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#44aa44" roughness={0.5}/></mesh>
      </Lm>
      {/* heidelbergCastle */}
      <Lm p={L.heidelbergCastle} info={INFO.heidelbergCastle}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#bb9944" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#bb9944"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#bb9944"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#bb9944"/></mesh>
      </Lm>
      {/* bavAlps */}
      <Lm p={L.bavAlps} info={INFO.bavAlps}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#aabbcc" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#aabbcc" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* hamburgHarbor */}
      <Lm p={L.hamburgHarbor} info={INFO.hamburgHarbor}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#334466" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#334466"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#334466"/></mesh>
      </Lm>
      {/* rothenburg */}
      <Lm p={L.rothenburg} info={INFO.rothenburg}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9933" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9933"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc9933"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc9933"/></mesh>
      </Lm>
      {/* munichMarien */}
      <Lm p={L.munichMarien} info={INFO.munichMarien}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc8822" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc8822"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc8822"/></mesh>
      </Lm>

      {/* ══ Japan ════════════════════════════════════════════════════════ */}
      {/* mountFuji */}
      <Lm p={L.mountFuji} info={INFO.mountFuji} mk="mountFuji">
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#667799" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#667799" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#ffffff" roughness={0.5}/></mesh>
      </Lm>
      {/* fushimiInari */}
      <Lm p={L.fushimiInari} info={INFO.fushimiInari} mk="fushimiInari">
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc3322" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc3322"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc3322"/></mesh>
      </Lm>
      {/* hiroshimaPeace */}
      <Lm p={L.hiroshimaPeace} info={INFO.hiroshimaPeace}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#888888" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#888888"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#888888"/></mesh>
      </Lm>
      {/* naraDeer */}
      <Lm p={L.naraDeer} info={INFO.naraDeer}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#88aa44" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#88aa44"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#88aa44"/></mesh>
      </Lm>
      {/* osakaCastle */}
      <Lm p={L.osakaCastle} info={INFO.osakaCastle} mk="osakaCastle">
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#4488cc" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#4488cc"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#4488cc"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#4488cc"/></mesh>
      </Lm>
      {/* arashiyamaBamboo */}
      <Lm p={L.arashiyamaBamboo} info={INFO.arashiyamaBamboo}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#44aa44" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#44aa44"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#44aa44"/></mesh>
      </Lm>
      {/* himejCastle */}
      <Lm p={L.himejCastle} info={INFO.himejCastle}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0f0f0" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0f0f0"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#f0f0f0"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#f0f0f0"/></mesh>
      </Lm>
      {/* hokkaidoLav */}
      <Lm p={L.hokkaidoLav} info={INFO.hokkaidoLav}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#9944cc" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#9944cc"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#9944cc"/></mesh>
      </Lm>
      {/* shibuyaCrossing */}
      <Lm p={L.shibuyaCrossing} info={INFO.shibuyaCrossing}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#334466" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#334466"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#334466"/></mesh>
      </Lm>
      {/* kyotoTemple */}
      <Lm p={L.kyotoTemple} info={INFO.kyotoTemple}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc8822" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc8822"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc8822"/></mesh>
      </Lm>

      {/* ══ Australia ════════════════════════════════════════════════════ */}
      {/* sydneyOpera */}
      <Lm p={L.sydneyOpera} info={INFO.sydneyOpera}>
        <mesh position={[0,0.06,0]} scale={[0.7,0.12,0.7]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0f8ff" roughness={0.6}/></mesh>
        <mesh position={[0,0.2,0]} scale={[0.5,0.2,0.5]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0f8ff"/></mesh>
        <mesh position={[0,0.38,0]}><sphereGeometry args={[0.22,16,12]}/><meshStandardMaterial color="#f0f8ff" roughness={0.3} metalness={0.1}/></mesh>
      </Lm>
      {/* uluru */}
      <Lm p={L.uluru} info={INFO.uluru}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#cc5522" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#cc5522" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#dd6633" roughness={0.5}/></mesh>
      </Lm>
      {/* blueMountains */}
      <Lm p={L.blueMountains} info={INFO.blueMountains}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#7799bb" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#7799bb" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* greatOceanRoad */}
      <Lm p={L.greatOceanRoad} info={INFO.greatOceanRoad}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#2288cc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* kakaduNP */}
      <Lm p={L.kakaduNP} info={INFO.kakaduNP}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#44aa44" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#44aa44"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#44aa44"/></mesh>
      </Lm>
      {/* whitsundays */}
      <Lm p={L.whitsundays} info={INFO.whitsundays}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#22aacc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* bondiBeach */}
      <Lm p={L.bondiBeach} info={INFO.bondiBeach}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#22aacc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* daintreeRF */}
      <Lm p={L.daintreeRF} info={INFO.daintreeRF}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#228833" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#228833"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#228833"/></mesh>
      </Lm>
      {/* purnululu */}
      <Lm p={L.purnululu} info={INFO.purnululu}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#cc7744" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#cc7744" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#dd8855" roughness={0.5}/></mesh>
      </Lm>
      {/* tasmaniaFreycinet */}
      <Lm p={L.tasmaniaFreycinet} info={INFO.tasmaniaFreycinet}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#778899" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#778899" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>

      {/* ══ China ════════════════════════════════════════════════════════ */}
      {/* forbiddenCity */}
      <Lm p={L.forbiddenCity} info={INFO.forbiddenCity} mk="forbiddenCity">
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc4422" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc4422"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc4422"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc4422"/></mesh>
      </Lm>
      {/* terracottaArmy */}
      <Lm p={L.terracottaArmy} info={INFO.terracottaArmy} mk="terracottaArmy">
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#c8a866" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#c8a866"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#c8a866"/></mesh>
      </Lm>
      {/* liRiverChina */}
      <Lm p={L.liRiverChina} info={INFO.liRiverChina}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#55aa88" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#55aa88" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* zhangjiajie */}
      <Lm p={L.zhangjiajie} info={INFO.zhangjiajie}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#667799" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#667799" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* yellowMountain */}
      <Lm p={L.yellowMountain} info={INFO.yellowMountain}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#9999bb" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#9999bb" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* potalaLhasa */}
      <Lm p={L.potalaLhasa} info={INFO.potalaLhasa} mk="potalaLhasa">
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0f0e8" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0f0e8"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#f0f0e8"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#f0f0e8"/></mesh>
      </Lm>
      {/* westLakeHangzhou */}
      <Lm p={L.westLakeHangzhou} info={INFO.westLakeHangzhou}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#33aacc" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#33aacc"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#33aacc"/></mesh>
      </Lm>
      {/* guilinKarst */}
      <Lm p={L.guilinKarst} info={INFO.guilinKarst}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#667799" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#667799" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* summerPalaceB */}
      <Lm p={L.summerPalaceB} info={INFO.summerPalaceB}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc8822" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc8822"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc8822"/></mesh>
      </Lm>
      {/* lijiangOldTown */}
      <Lm p={L.lijiangOldTown} info={INFO.lijiangOldTown}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#aa6633" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#aa6633"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#aa6633"/></mesh>
      </Lm>

      {/* ══ India ════════════════════════════════════════════════════════ */}
      {/* jaipurAmber */}
      <Lm p={L.jaipurAmber} info={INFO.jaipurAmber}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8833" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
      </Lm>
      {/* keralaBackwaters */}
      <Lm p={L.keralaBackwaters} info={INFO.keralaBackwaters}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#22aacc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* varanasiGhats */}
      <Lm p={L.varanasiGhats} info={INFO.varanasiGhats}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#ff8822" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#ff8822"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#ff8822"/></mesh>
      </Lm>
      {/* goaBeaches */}
      <Lm p={L.goaBeaches} info={INFO.goaBeaches}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#22ccbb" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* goldenTempleAm */}
      <Lm p={L.goldenTempleAm} info={INFO.goldenTempleAm}>
        <mesh position={[0,0.06,0]} scale={[0.7,0.12,0.7]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d4c020" roughness={0.6}/></mesh>
        <mesh position={[0,0.2,0]} scale={[0.5,0.2,0.5]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d4c020"/></mesh>
        <mesh position={[0,0.38,0]}><sphereGeometry args={[0.22,16,12]}/><meshStandardMaterial color="#d4c020" roughness={0.3} metalness={0.1}/></mesh>
      </Lm>
      {/* mumbaiGateway */}
      <Lm p={L.mumbaiGateway} info={INFO.mumbaiGateway}>
        <mesh position={[-0.18,0.2,0]} scale={[0.09,0.4,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8b870" roughness={0.7}/></mesh>
        <mesh position={[ 0.18,0.2,0]} scale={[0.09,0.4,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8b870"/></mesh>
        <mesh position={[0,0.44,0]} scale={[0.45,0.1,0.09]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8b870"/></mesh>
      </Lm>
      {/* hawaMahal */}
      <Lm p={L.hawaMahal} info={INFO.hawaMahal}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#ee8833" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#ee8833"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#ee8833"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#ee8833"/></mesh>
      </Lm>
      {/* ajantaCaves */}
      <Lm p={L.ajantaCaves} info={INFO.ajantaCaves}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc9944" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc9944"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc9944"/></mesh>
      </Lm>
      {/* ranthambore */}
      <Lm p={L.ranthambore} info={INFO.ranthambore}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#88aa44" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#88aa44"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#88aa44"/></mesh>
      </Lm>
      {/* delhiQutub */}
      <Lm p={L.delhiQutub} info={INFO.delhiQutub}>
        <mesh position={[0,0.04,0]} scale={[0.14,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9944" roughness={0.6}/></mesh>
        <mesh position={[0,0.28,0]}><cylinderGeometry args={[0.04,0.08,0.44,8]}/><meshStandardMaterial color="#cc9944"/></mesh>
        <mesh position={[0,0.54,0]}><coneGeometry args={[0.04,0.14,8]}/><meshStandardMaterial color="#cc9944" metalness={0.3}/></mesh>
      </Lm>

      {/* ══ Thailand ═════════════════════════════════════════════════════ */}
      {/* grandPalaceBKK */}
      <Lm p={L.grandPalaceBKK} info={INFO.grandPalaceBKK}>
        <mesh position={[0,0.06,0]} scale={[0.7,0.12,0.7]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8820" roughness={0.6}/></mesh>
        <mesh position={[0,0.2,0]} scale={[0.5,0.2,0.5]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8820"/></mesh>
        <mesh position={[0,0.38,0]}><sphereGeometry args={[0.22,16,12]}/><meshStandardMaterial color="#cc8820" roughness={0.3} metalness={0.1}/></mesh>
      </Lm>
      {/* phiPhiIslands */}
      <Lm p={L.phiPhiIslands} info={INFO.phiPhiIslands}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#22aacc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* chiangMaiTemple */}
      <Lm p={L.chiangMaiTemple} info={INFO.chiangMaiTemple}>
        <mesh position={[0,0.06,0]} scale={[0.7,0.12,0.7]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8822" roughness={0.6}/></mesh>
        <mesh position={[0,0.2,0]} scale={[0.5,0.2,0.5]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8822"/></mesh>
        <mesh position={[0,0.38,0]}><sphereGeometry args={[0.22,16,12]}/><meshStandardMaterial color="#cc8822" roughness={0.3} metalness={0.1}/></mesh>
      </Lm>
      {/* ayutthaya */}
      <Lm p={L.ayutthaya} info={INFO.ayutthaya}>
        <mesh position={[0,0.05,0]} scale={[0.8,0.1,0.8]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9944" roughness={0.7}/></mesh>
        <mesh position={[0,0.18,0]} scale={[0.55,0.16,0.55]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9944"/></mesh>
        <mesh position={[0,0.35,0]} scale={[0.32,0.16,0.32]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9944"/></mesh>
        <mesh position={[0,0.52,0]}><coneGeometry args={[0.16,0.18,4]}/><meshStandardMaterial color="#cc9944"/></mesh>
      </Lm>
      {/* railayBeach */}
      <Lm p={L.railayBeach} info={INFO.railayBeach}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#22bbcc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* whiteTempleCR */}
      <Lm p={L.whiteTempleCR} info={INFO.whiteTempleCR}>
        <mesh position={[0,0.06,0]} scale={[0.7,0.12,0.7]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0f0f0" roughness={0.6}/></mesh>
        <mesh position={[0,0.2,0]} scale={[0.5,0.2,0.5]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0f0f0"/></mesh>
        <mesh position={[0,0.38,0]}><sphereGeometry args={[0.22,16,12]}/><meshStandardMaterial color="#f0f0f0" roughness={0.3} metalness={0.1}/></mesh>
      </Lm>
      {/* erawanFalls */}
      <Lm p={L.erawanFalls} info={INFO.erawanFalls}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#2299aa" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#2299aa"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#2299aa"/></mesh>
      </Lm>
      {/* sukhothai */}
      <Lm p={L.sukhothai} info={INFO.sukhothai}>
        <mesh position={[0,0.05,0]} scale={[0.8,0.1,0.8]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8a866" roughness={0.7}/></mesh>
        <mesh position={[0,0.18,0]} scale={[0.55,0.16,0.55]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8a866"/></mesh>
        <mesh position={[0,0.35,0]} scale={[0.32,0.16,0.32]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8a866"/></mesh>
        <mesh position={[0,0.52,0]}><coneGeometry args={[0.16,0.18,4]}/><meshStandardMaterial color="#c8a866"/></mesh>
      </Lm>

      {/* ══ Greece ═══════════════════════════════════════════════════════ */}
      {/* santoriniGreece */}
      <Lm p={L.santoriniGreece} info={INFO.santoriniGreece} mk="santoriniGreece">
        <mesh position={[0,0.06,0]} scale={[0.7,0.12,0.7]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#3399ff" roughness={0.6}/></mesh>
        <mesh position={[0,0.2,0]} scale={[0.5,0.2,0.5]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#3399ff"/></mesh>
        <mesh position={[0,0.38,0]}><sphereGeometry args={[0.22,16,12]}/><meshStandardMaterial color="#3399ff" roughness={0.3} metalness={0.1}/></mesh>
      </Lm>
      {/* meteora */}
      <Lm p={L.meteora} info={INFO.meteora} mk="meteora">
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#887766" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#887766" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* delphi */}
      <Lm p={L.delphi} info={INFO.delphi}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#c8b870" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#c8b870"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#c8b870"/></mesh>
      </Lm>
      {/* olympia */}
      <Lm p={L.olympia} info={INFO.olympia}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#c8b060" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#c8b060"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#c8b060"/></mesh>
      </Lm>
      {/* rhodesOldCity */}
      <Lm p={L.rhodesOldCity} info={INFO.rhodesOldCity}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8a060" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8a060"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c8a060"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c8a060"/></mesh>
      </Lm>
      {/* corfuOldTown */}
      <Lm p={L.corfuOldTown} info={INFO.corfuOldTown}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#aa8833" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#aa8833"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#aa8833"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#aa8833"/></mesh>
      </Lm>
      {/* knossosCrete */}
      <Lm p={L.knossosCrete} info={INFO.knossosCrete}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc9944" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc9944"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc9944"/></mesh>
      </Lm>
      {/* mykonos */}
      <Lm p={L.mykonos} info={INFO.mykonos}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#3388ff" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#3388ff"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#3388ff"/></mesh>
      </Lm>
      {/* navagioBeach */}
      <Lm p={L.navagioBeach} info={INFO.navagioBeach}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#2299cc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* nafplio */}
      <Lm p={L.nafplio} info={INFO.nafplio}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#886644" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#886644"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#886644"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#886644"/></mesh>
      </Lm>

      {/* ══ Turkey ═══════════════════════════════════════════════════════ */}
      {/* pamukkale */}
      <Lm p={L.pamukkale} info={INFO.pamukkale}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#f0f0f0" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#f0f0f0"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#f0f0f0"/></mesh>
      </Lm>
      {/* ephesus */}
      <Lm p={L.ephesus} info={INFO.ephesus}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#c8a866" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#c8a866"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#c8a866"/></mesh>
      </Lm>
      {/* blueMosque */}
      <Lm p={L.blueMosque} info={INFO.blueMosque}>
        <mesh position={[0,0.06,0]} scale={[0.7,0.12,0.7]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#5566aa" roughness={0.6}/></mesh>
        <mesh position={[0,0.2,0]} scale={[0.5,0.2,0.5]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#5566aa"/></mesh>
        <mesh position={[0,0.38,0]}><sphereGeometry args={[0.22,16,12]}/><meshStandardMaterial color="#5566aa" roughness={0.3} metalness={0.1}/></mesh>
      </Lm>
      {/* topkapiPalace */}
      <Lm p={L.topkapiPalace} info={INFO.topkapiPalace}>
        <mesh position={[0,0.06,0]} scale={[0.7,0.12,0.7]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8833" roughness={0.6}/></mesh>
        <mesh position={[0,0.2,0]} scale={[0.5,0.2,0.5]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[0,0.38,0]}><sphereGeometry args={[0.22,16,12]}/><meshStandardMaterial color="#cc8833" roughness={0.3} metalness={0.1}/></mesh>
      </Lm>
      {/* bodrumTurkey */}
      <Lm p={L.bodrumTurkey} info={INFO.bodrumTurkey}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#3388cc" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#3388cc"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#3388cc"/></mesh>
      </Lm>
      {/* gobekliTepe */}
      <Lm p={L.gobekliTepe} info={INFO.gobekliTepe}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#997755" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#997755"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#997755"/></mesh>
      </Lm>
      {/* nemrutDag */}
      <Lm p={L.nemrutDag} info={INFO.nemrutDag}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#887766" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#887766" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* sumelaMonastery */}
      <Lm p={L.sumelaMonastery} info={INFO.sumelaMonastery}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#888888" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#888888"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#888888"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#888888"/></mesh>
      </Lm>

      {/* ══ Brazil ═══════════════════════════════════════════════════════ */}
      {/* amazonManaus */}
      <Lm p={L.amazonManaus} info={INFO.amazonManaus}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#228833" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#228833"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#228833"/></mesh>
      </Lm>
      {/* copacabana */}
      <Lm p={L.copacabana} info={INFO.copacabana}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#22aacc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* pantanal */}
      <Lm p={L.pantanal} info={INFO.pantanal}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#44aa66" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#44aa66"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#44aa66"/></mesh>
      </Lm>
      {/* fernandoNoronha */}
      <Lm p={L.fernandoNoronha} info={INFO.fernandoNoronha}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#22aacc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* salvadorHistoric */}
      <Lm p={L.salvadorHistoric} info={INFO.salvadorHistoric}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc6633" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc6633"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc6633"/></mesh>
      </Lm>
      {/* lencoisM */}
      <Lm p={L.lencoisM} info={INFO.lencoisM}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#ddccaa" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#ddccaa"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#ddccaa"/></mesh>
      </Lm>
      {/* ouroPreto */}
      <Lm p={L.ouroPreto} info={INFO.ouroPreto}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#884422" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#884422"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#884422"/></mesh>
      </Lm>

      {/* ══ Mexico ═══════════════════════════════════════════════════════ */}
      {/* teotihuacan */}
      <Lm p={L.teotihuacan} info={INFO.teotihuacan}>
        <mesh position={[0,0.05,0]} scale={[0.8,0.1,0.8]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d4aa44" roughness={0.7}/></mesh>
        <mesh position={[0,0.18,0]} scale={[0.55,0.16,0.55]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d4aa44"/></mesh>
        <mesh position={[0,0.35,0]} scale={[0.32,0.16,0.32]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#d4aa44"/></mesh>
        <mesh position={[0,0.52,0]}><coneGeometry args={[0.16,0.18,4]}/><meshStandardMaterial color="#d4aa44"/></mesh>
      </Lm>
      {/* palenqueMx */}
      <Lm p={L.palenqueMx} info={INFO.palenqueMx}>
        <mesh position={[0,0.05,0]} scale={[0.8,0.1,0.8]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#88aa44" roughness={0.7}/></mesh>
        <mesh position={[0,0.18,0]} scale={[0.55,0.16,0.55]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#88aa44"/></mesh>
        <mesh position={[0,0.35,0]} scale={[0.32,0.16,0.32]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#88aa44"/></mesh>
        <mesh position={[0,0.52,0]}><coneGeometry args={[0.16,0.18,4]}/><meshStandardMaterial color="#88aa44"/></mesh>
      </Lm>
      {/* tulumMx */}
      <Lm p={L.tulumMx} info={INFO.tulumMx}>
        <mesh position={[0,0.05,0]} scale={[0.8,0.1,0.8]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#ddcc88" roughness={0.7}/></mesh>
        <mesh position={[0,0.18,0]} scale={[0.55,0.16,0.55]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#ddcc88"/></mesh>
        <mesh position={[0,0.35,0]} scale={[0.32,0.16,0.32]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#ddcc88"/></mesh>
        <mesh position={[0,0.52,0]}><coneGeometry args={[0.16,0.18,4]}/><meshStandardMaterial color="#ddcc88"/></mesh>
      </Lm>
      {/* copperCanyonMx */}
      <Lm p={L.copperCanyonMx} info={INFO.copperCanyonMx}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#cc8844" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#cc8844" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* oaxacaMontAlban */}
      <Lm p={L.oaxacaMontAlban} info={INFO.oaxacaMontAlban}>
        <mesh position={[0,0.05,0]} scale={[0.8,0.1,0.8]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9944" roughness={0.7}/></mesh>
        <mesh position={[0,0.18,0]} scale={[0.55,0.16,0.55]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9944"/></mesh>
        <mesh position={[0,0.35,0]} scale={[0.32,0.16,0.32]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9944"/></mesh>
        <mesh position={[0,0.52,0]}><coneGeometry args={[0.16,0.18,4]}/><meshStandardMaterial color="#cc9944"/></mesh>
      </Lm>
      {/* mexicoCathedral */}
      <Lm p={L.mexicoCathedral} info={INFO.mexicoCathedral}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c0a870" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c0a870"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c0a870"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#c0a870"/></mesh>
      </Lm>
      {/* guanajuatoMx */}
      <Lm p={L.guanajuatoMx} info={INFO.guanajuatoMx}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc8833" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
      </Lm>
      {/* caboSanLucas */}
      <Lm p={L.caboSanLucas} info={INFO.caboSanLucas}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#22aacc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>

      {/* ══ Peru ═════════════════════════════════════════════════════════ */}
      {/* lakeTiticaca */}
      <Lm p={L.lakeTiticaca} info={INFO.lakeTiticaca}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#2266aa" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#2266aa"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#2266aa"/></mesh>
      </Lm>
      {/* nazcaLines */}
      <Lm p={L.nazcaLines} info={INFO.nazcaLines}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc9966" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc9966"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc9966"/></mesh>
      </Lm>
      {/* cusco */}
      <Lm p={L.cusco} info={INFO.cusco}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc8833" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
      </Lm>
      {/* colcaCanyon */}
      <Lm p={L.colcaCanyon} info={INFO.colcaCanyon}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#8899aa" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#8899aa" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* chanChan */}
      <Lm p={L.chanChan} info={INFO.chanChan}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc9966" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc9966"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc9966"/></mesh>
      </Lm>

      {/* ══ Egypt ════════════════════════════════════════════════════════ */}
      {/* valleyOfKings */}
      <Lm p={L.valleyOfKings} info={INFO.valleyOfKings}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#c8a844" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#c8a844"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#c8a844"/></mesh>
      </Lm>
      {/* karnakTemple */}
      <Lm p={L.karnakTemple} info={INFO.karnakTemple}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#d4b860" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#d4b860"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#d4b860"/></mesh>
      </Lm>
      {/* luxorTemple */}
      <Lm p={L.luxorTemple} info={INFO.luxorTemple}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#d4b860" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#d4b860"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#d4b860"/></mesh>
      </Lm>
      {/* alexandriaEgypt */}
      <Lm p={L.alexandriaEgypt} info={INFO.alexandriaEgypt}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#3388cc" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#3388cc"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#3388cc"/></mesh>
      </Lm>
      {/* mountSinai */}
      <Lm p={L.mountSinai} info={INFO.mountSinai}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#887755" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#887755" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>

      {/* ══ Africa ═══════════════════════════════════════════════════════ */}
      {/* maasaiMara */}
      <Lm p={L.maasaiMara} info={INFO.maasaiMara} mk="maasaiMara">
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#88aa44" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#88aa44"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#88aa44"/></mesh>
      </Lm>
      {/* serengeti */}
      <Lm p={L.serengeti} info={INFO.serengeti}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#aa9944" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#aa9944"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#aa9944"/></mesh>
      </Lm>
      {/* kilimanjaro */}
      <Lm p={L.kilimanjaro} info={INFO.kilimanjaro} mk="kilimanjaro">
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#aabbcc" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#aabbcc" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* krugerNP */}
      <Lm p={L.krugerNP} info={INFO.krugerNP}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#88aa44" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#88aa44"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#88aa44"/></mesh>
      </Lm>
      {/* capePointSA */}
      <Lm p={L.capePointSA} info={INFO.capePointSA}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#778899" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#778899" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* moroccoMar */}
      <Lm p={L.moroccoMar} info={INFO.moroccoMar} mk="moroccoMar">
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8833" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
      </Lm>
      {/* moroccoSahara */}
      <Lm p={L.moroccoSahara} info={INFO.moroccoSahara}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#ddbb44" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#ddbb44" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#eecc55" roughness={0.5}/></mesh>
      </Lm>
      {/* zanzibar */}
      <Lm p={L.zanzibar} info={INFO.zanzibar}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#22aacc" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>
      {/* lalibelaEth */}
      <Lm p={L.lalibelaEth} info={INFO.lalibelaEth}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc6644" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc6644"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc6644"/></mesh>
      </Lm>
      {/* drakensberg */}
      <Lm p={L.drakensberg} info={INFO.drakensberg}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#889988" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#889988" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* nairobiNP */}
      <Lm p={L.nairobiNP} info={INFO.nairobiNP}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#88aa44" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#88aa44"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#88aa44"/></mesh>
      </Lm>
      {/* ngorongoroCrater */}
      <Lm p={L.ngorongoroCrater} info={INFO.ngorongoroCrater}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#88aa66" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#88aa66"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#88aa66"/></mesh>
      </Lm>

      {/* ══ Iceland ══════════════════════════════════════════════════════ */}
      {/* reykjavikH */}
      <Lm p={L.reykjavikH} info={INFO.reykjavikH}>
        <mesh position={[0,0.08,0]}><cylinderGeometry args={[0.1,0.13,0.16,8]}/><meshStandardMaterial color="#cc9944" roughness={0.5}/></mesh>
        <mesh position={[0,0.35,0]}><cylinderGeometry args={[0.06,0.1,0.38,8]}/><meshStandardMaterial color="#cc9944"/></mesh>
        <mesh position={[0,0.56,0]}><cylinderGeometry args={[0.09,0.06,0.06,8]}/><meshStandardMaterial color="#cc9944"/></mesh>
        <mesh position={[0,0.72,0]}><coneGeometry args={[0.04,0.18,8]}/><meshStandardMaterial color="#cc9944"/></mesh>
      </Lm>
      {/* geysirIceland */}
      <Lm p={L.geysirIceland} info={INFO.geysirIceland}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.12,0.15,0.12,10]}/><meshStandardMaterial color="#888880" roughness={0.8}/></mesh>
        <mesh position={[0,0.28,0]}><cylinderGeometry args={[0.04,0.08,0.32,10]}/><meshStandardMaterial color="#b8e8f8" roughness={0.3} transparent opacity={0.85}/></mesh>
        <mesh position={[0,0.5,0]}><sphereGeometry args={[0.1,10,8]}/><meshStandardMaterial color="#b8e8f8" roughness={0.3} transparent opacity={0.7}/></mesh>
      </Lm>
      {/* skogafoss */}
      <Lm p={L.skogafoss} info={INFO.skogafoss}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#2288cc" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#2288cc"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#2288cc"/></mesh>
      </Lm>

      {/* ══ Norway ═══════════════════════════════════════════════════════ */}
      {/* geirangerfjord */}
      <Lm p={L.geirangerfjord} info={INFO.geirangerfjord}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#2277aa" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#2277aa"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#2277aa"/></mesh>
      </Lm>
      {/* tromsoLights */}
      <Lm p={L.tromsoLights} info={INFO.tromsoLights}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#44aacc" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#44aacc"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#44aacc" emissive="#44aacc" emissiveIntensity={0.3}/></mesh>
      </Lm>
      {/* bergenWharf */}
      <Lm p={L.bergenWharf} info={INFO.bergenWharf}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc6633" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc6633"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc6633"/></mesh>
      </Lm>

      {/* ══ Canada ═══════════════════════════════════════════════════════ */}
      {/* banffNP */}
      <Lm p={L.banffNP} info={INFO.banffNP}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#7799aa" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#7799aa" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* quebecOldCity */}
      <Lm p={L.quebecOldCity} info={INFO.quebecOldCity}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8833" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
      </Lm>
      {/* whistlerBC */}
      <Lm p={L.whistlerBC} info={INFO.whistlerBC}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#aabbcc" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#aabbcc" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>
      {/* haida */}
      <Lm p={L.haida} info={INFO.haida}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#228844" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#228844"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#228844"/></mesh>
      </Lm>

      {/* ══ New Zealand ══════════════════════════════════════════════════ */}
      {/* hobbiton */}
      <Lm p={L.hobbiton} info={INFO.hobbiton}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#44aa44" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#44aa44"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#44aa44"/></mesh>
      </Lm>
      {/* rotoruaNZ */}
      <Lm p={L.rotoruaNZ} info={INFO.rotoruaNZ}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.12,0.15,0.12,10]}/><meshStandardMaterial color="#888880" roughness={0.8}/></mesh>
        <mesh position={[0,0.28,0]}><cylinderGeometry args={[0.04,0.08,0.32,10]}/><meshStandardMaterial color="#88aacc" roughness={0.3} transparent opacity={0.85}/></mesh>
        <mesh position={[0,0.5,0]}><sphereGeometry args={[0.1,10,8]}/><meshStandardMaterial color="#88aacc" roughness={0.3} transparent opacity={0.7}/></mesh>
      </Lm>
      {/* fiordlandNZ */}
      <Lm p={L.fiordlandNZ} info={INFO.fiordlandNZ}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#5588aa" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#5588aa" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>

      {/* ══ Jordan ═══════════════════════════════════════════════════════ */}
      {/* wadiRum */}
      <Lm p={L.wadiRum} info={INFO.wadiRum}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#dd8833" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#dd8833" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#ee9944" roughness={0.5}/></mesh>
      </Lm>
      {/* deadSea */}
      <Lm p={L.deadSea} info={INFO.deadSea}>
        <mesh position={[0,0.02,0]} scale={[0.5,0.04,0.35]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#f0d888" roughness={0.9}/></mesh>
        <mesh position={[0,0.06,0.2]} scale={[0.5,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#3399aa" roughness={0.3} transparent opacity={0.85}/></mesh>
      </Lm>

      {/* ══ Russia ═══════════════════════════════════════════════════════ */}
      {/* stBasils */}
      <Lm p={L.stBasils} info={INFO.stBasils}>
        <mesh position={[0,0.06,0]} scale={[0.7,0.12,0.7]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc3322" roughness={0.6}/></mesh>
        <mesh position={[0,0.2,0]} scale={[0.5,0.2,0.5]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc3322"/></mesh>
        <mesh position={[0,0.38,0]}><sphereGeometry args={[0.22,16,12]}/><meshStandardMaterial color="#cc3322" roughness={0.3} metalness={0.1}/></mesh>
      </Lm>
      {/* lakeBaikal */}
      <Lm p={L.lakeBaikal} info={INFO.lakeBaikal}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#2266aa" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#2266aa"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#2266aa"/></mesh>
      </Lm>
      {/* hermitageSPB */}
      <Lm p={L.hermitageSPB} info={INFO.hermitageSPB}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#44aacc" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#44aacc"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#44aacc"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#44aacc"/></mesh>
      </Lm>

      {/* ══ Vietnam ══════════════════════════════════════════════════════ */}
      {/* hoiAnVietnam */}
      <Lm p={L.hoiAnVietnam} info={INFO.hoiAnVietnam}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc8833" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
      </Lm>
      {/* hanoiHoanKiem */}
      <Lm p={L.hanoiHoanKiem} info={INFO.hanoiHoanKiem}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#33aa88" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#33aa88"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#33aa88"/></mesh>
      </Lm>

      {/* ══ Indonesia ════════════════════════════════════════════════════ */}
      {/* baliUluwatu */}
      <Lm p={L.baliUluwatu} info={INFO.baliUluwatu}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc8833" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
      </Lm>
      {/* komodoPark */}
      <Lm p={L.komodoPark} info={INFO.komodoPark}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#44aa44" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#44aa44"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#44aa44"/></mesh>
      </Lm>
      {/* prambananJava */}
      <Lm p={L.prambananJava} info={INFO.prambananJava}>
        <mesh position={[0,0.05,0]} scale={[0.8,0.1,0.8]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8b066" roughness={0.7}/></mesh>
        <mesh position={[0,0.18,0]} scale={[0.55,0.16,0.55]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8b066"/></mesh>
        <mesh position={[0,0.35,0]} scale={[0.32,0.16,0.32]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#c8b066"/></mesh>
        <mesh position={[0,0.52,0]}><coneGeometry args={[0.16,0.18,4]}/><meshStandardMaterial color="#c8b066"/></mesh>
      </Lm>

      {/* ══ Portugal ═════════════════════════════════════════════════════ */}
      {/* lisbonBelem */}
      <Lm p={L.lisbonBelem} info={INFO.lisbonBelem}>
        <mesh position={[0,0.08,0]}><cylinderGeometry args={[0.1,0.13,0.16,8]}/><meshStandardMaterial color="#d4c880" roughness={0.5}/></mesh>
        <mesh position={[0,0.35,0]}><cylinderGeometry args={[0.06,0.1,0.38,8]}/><meshStandardMaterial color="#d4c880"/></mesh>
        <mesh position={[0,0.56,0]}><cylinderGeometry args={[0.09,0.06,0.06,8]}/><meshStandardMaterial color="#d4c880"/></mesh>
        <mesh position={[0,0.72,0]}><coneGeometry args={[0.04,0.18,8]}/><meshStandardMaterial color="#d4c880"/></mesh>
      </Lm>
      {/* sintraPortugal */}
      <Lm p={L.sintraPortugal} info={INFO.sintraPortugal}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#e8d080" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#e8d080"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#e8d080"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#e8d080"/></mesh>
      </Lm>

      {/* ══ Netherlands ══════════════════════════════════════════════════ */}
      {/* keukenhofTulips */}
      <Lm p={L.keukenhofTulips} info={INFO.keukenhofTulips}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#ee44aa" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#ee44aa"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#ee44aa"/></mesh>
      </Lm>
      {/* kinderdijkMills */}
      <Lm p={L.kinderdijkMills} info={INFO.kinderdijkMills}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc8833" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
      </Lm>

      {/* ══ Czech Republic ═══════════════════════════════════════════════ */}
      {/* pragueCastle */}
      <Lm p={L.pragueCastle} info={INFO.pragueCastle}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#aabb88" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#aabb88"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#aabb88"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#aabb88"/></mesh>
      </Lm>

      {/* ══ Austria ══════════════════════════════════════════════════════ */}
      {/* hallstatt */}
      <Lm p={L.hallstatt} info={INFO.hallstatt}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#44aacc" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#44aacc"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#44aacc"/></mesh>
      </Lm>

      {/* ══ Switzerland ══════════════════════════════════════════════════ */}
      {/* interlaken */}
      <Lm p={L.interlaken} info={INFO.interlaken}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#aabbcc" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#aabbcc" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>

      {/* ══ Cambodia ═════════════════════════════════════════════════════ */}
      {/* taProhm */}
      <Lm p={L.taProhm} info={INFO.taProhm}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#88aa44" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#88aa44"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#88aa44"/></mesh>
      </Lm>

      {/* ══ Sri Lanka ════════════════════════════════════════════════════ */}
      {/* sigiriya */}
      <Lm p={L.sigiriya} info={INFO.sigiriya}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#cc6633" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#cc6633" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#dd7744" roughness={0.5}/></mesh>
      </Lm>
      {/* dalleTeaFields */}
      <Lm p={L.dalleTeaFields} info={INFO.dalleTeaFields}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#44aa44" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#44aa44"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#44aa44"/></mesh>
      </Lm>

      {/* ══ South Korea ══════════════════════════════════════════════════ */}
      {/* gyeongbokgung */}
      <Lm p={L.gyeongbokgung} info={INFO.gyeongbokgung}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc4422" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc4422"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc4422"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc4422"/></mesh>
      </Lm>
      {/* jejuIsland */}
      <Lm p={L.jejuIsland} info={INFO.jejuIsland}>
        <mesh position={[0,0.1,0]}><sphereGeometry args={[0.22,12,8]}/><meshStandardMaterial color="#44aa44" roughness={0.8}/></mesh>
        <mesh position={[0.15,0.18,0.1]}><sphereGeometry args={[0.14,10,6]}/><meshStandardMaterial color="#44aa44"/></mesh>
        <mesh position={[-0.1,0.14,-0.12]}><sphereGeometry args={[0.12,10,6]}/><meshStandardMaterial color="#44aa44"/></mesh>
      </Lm>

      {/* ══ Argentina ════════════════════════════════════════════════════ */}
      {/* buenosAires */}
      <Lm p={L.buenosAires} info={INFO.buenosAires}>
        <mesh position={[0,0.04,0]} scale={[0.14,0.08,0.14]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#4466aa" roughness={0.6}/></mesh>
        <mesh position={[0,0.28,0]}><cylinderGeometry args={[0.04,0.08,0.44,8]}/><meshStandardMaterial color="#4466aa"/></mesh>
        <mesh position={[0,0.54,0]}><coneGeometry args={[0.04,0.14,8]}/><meshStandardMaterial color="#4466aa" metalness={0.3}/></mesh>
      </Lm>
      {/* patagoniaArg */}
      <Lm p={L.patagoniaArg} info={INFO.patagoniaArg}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#7799bb" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#7799bb" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#e8f4ff" roughness={0.5}/></mesh>
      </Lm>

      {/* ══ Chile ════════════════════════════════════════════════════════ */}
      {/* atacamaDesert */}
      <Lm p={L.atacamaDesert} info={INFO.atacamaDesert}>
        <mesh position={[0,0.18,0]}><coneGeometry args={[0.32,0.5,7]}/><meshStandardMaterial color="#ddbb55" roughness={0.8}/></mesh>
        <mesh position={[0,0.46,0]}><coneGeometry args={[0.18,0.28,6]}/><meshStandardMaterial color="#ddbb55" roughness={0.7}/></mesh>
        <mesh position={[0,0.62,0]}><coneGeometry args={[0.12,0.22,6]}/><meshStandardMaterial color="#eecc66" roughness={0.5}/></mesh>
      </Lm>
      {/* easterIsland */}
      <Lm p={L.easterIsland} info={INFO.easterIsland}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#887766" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#887766"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#887766"/></mesh>
      </Lm>

      {/* ══ Colombia ═════════════════════════════════════════════════════ */}
      {/* cartagenaCO */}
      <Lm p={L.cartagenaCO} info={INFO.cartagenaCO}>
        <mesh position={[0,0.1,0]} scale={[0.6,0.2,0.45]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8833" roughness={0.7}/></mesh>
        <mesh position={[0,0.26,0]} scale={[0.5,0.18,0.38]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[-0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[ 0.22,0.4,0]}><coneGeometry args={[0.06,0.22,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
      </Lm>

      {/* ══ Cuba ═════════════════════════════════════════════════════════ */}
      {/* havanaOldCity */}
      <Lm p={L.havanaOldCity} info={INFO.havanaOldCity}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc6633" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc6633"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc6633"/></mesh>
      </Lm>

      {/* ══ Nepal ════════════════════════════════════════════════════════ */}
      {/* kathmanduPatan */}
      <Lm p={L.kathmanduPatan} info={INFO.kathmanduPatan}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#cc8833" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#cc8833"/></mesh>
      </Lm>

      {/* ══ Myanmar ══════════════════════════════════════════════════════ */}
      {/* bagan */}
      <Lm p={L.bagan} info={INFO.bagan}>
        <mesh position={[0,0.05,0]} scale={[0.8,0.1,0.8]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9944" roughness={0.7}/></mesh>
        <mesh position={[0,0.18,0]} scale={[0.55,0.16,0.55]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9944"/></mesh>
        <mesh position={[0,0.35,0]} scale={[0.32,0.16,0.32]}><boxGeometry args={[1,1,1]}/><meshStandardMaterial color="#cc9944"/></mesh>
        <mesh position={[0,0.52,0]}><coneGeometry args={[0.16,0.18,4]}/><meshStandardMaterial color="#cc9944"/></mesh>
      </Lm>

      {/* ══ Iran ═════════════════════════════════════════════════════════ */}
      {/* persepolisIran */}
      <Lm p={L.persepolisIran} info={INFO.persepolisIran}>
        <mesh position={[0,0.06,0]}><cylinderGeometry args={[0.09,0.11,0.12,8]}/><meshStandardMaterial color="#d4aa60" roughness={0.6}/></mesh>
        <mesh position={[0,0.21,0]}><cylinderGeometry args={[0.045,0.09,0.18,8]}/><meshStandardMaterial color="#d4aa60"/></mesh>
        <mesh position={[0,0.33,0]}><sphereGeometry args={[0.065,12,8]}/><meshStandardMaterial color="#d4aa60"/></mesh>
      </Lm>

    </>
  );
}

// --- Geographic label helpers --------------------------------------------------
