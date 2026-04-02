/* ============================================================
   PREDICTOR — Matchup Prediction Engine
   Win probability, projected score, market edge, betting context
   ============================================================ */
const predictor = {

    moneylineToProbability(odds) {
        const numeric = Number(String(odds).replace('+', ''));
        if (!Number.isFinite(numeric) || numeric === 0) return null;
        if (numeric < 0) return Math.abs(numeric) / (Math.abs(numeric) + 100);
        return 100 / (numeric + 100);
    },

    parseStreak(streakStr) {
        if (!streakStr || streakStr === '--') return 0;
        const match = String(streakStr).match(/^([WL])(\d+)$/i);
        if (!match) return 0;
        const value = parseInt(match[2], 10) || 0;
        return match[1].toUpperCase() === 'W' ? value : -value;
    },

    roundHalf(value) {
        return Math.round(value * 2) / 2;
    },

    findMatchingEvent(teamAId, teamBId) {
        return (store.state.games || []).find((event) => {
            const competitors = event?.competitions?.[0]?.competitors || [];
            const ids = competitors.map((competitor) => String(competitor?.team?.id));
            return ids.includes(String(teamAId)) && ids.includes(String(teamBId));
        }) || null;
    },

    extractOdds(eventOrSummary) {
        const competition = eventOrSummary?.competitions?.[0] ||
            eventOrSummary?.header?.competitions?.[0] ||
            eventOrSummary?.competition ||
            null;
        const odds = competition?.odds?.[0] || eventOrSummary?.odds?.[0] || eventOrSummary?.pickcenter?.[0] || null;
        if (!odds) return null;

        const homeMoneyline = odds?.moneyline?.home?.close?.odds ?? odds?.homeTeamOdds?.moneyLine ?? null;
        const awayMoneyline = odds?.moneyline?.away?.close?.odds ?? odds?.awayTeamOdds?.moneyLine ?? null;
        const homeSpread = odds?.pointSpread?.home?.close?.line ?? null;
        const awaySpread = odds?.pointSpread?.away?.close?.line ?? null;

        return {
            provider: odds?.provider?.displayName || odds?.provider?.name || 'ESPN Odds',
            details: odds?.details || '',
            overUnder: Number.isFinite(Number(odds?.overUnder)) ? Number(odds.overUnder) : null,
            spread: Number.isFinite(Number(odds?.spread)) ? Number(odds.spread) : null,
            homeSpread: Number.isFinite(Number(homeSpread)) ? Number(homeSpread) : null,
            awaySpread: Number.isFinite(Number(awaySpread)) ? Number(awaySpread) : null,
            homeMoneyline,
            awayMoneyline,
            link: odds?.link?.href || odds?.moneyline?.home?.close?.link?.href || odds?.moneyline?.away?.close?.link?.href || '',
        };
    },

    buildDrivers(teamA, teamB, aStats, bStats, playersA, playersB, matchup) {
        const drivers = [];

        const netDiff = Number((parseFloat(bStats.netRtg || 0) - parseFloat(aStats.netRtg || 0)).toFixed(1));
        if (Math.abs(netDiff) >= 2.5) {
            drivers.push(`${netDiff > 0 ? teamB.team.abbreviation : teamA.team.abbreviation} owns the stronger net rating profile (${Math.abs(netDiff).toFixed(1)} better).`);
        }

        const offenseGap = Number((parseFloat(bStats.offRating || 0) - parseFloat(aStats.offRating || 0)).toFixed(1));
        if (Math.abs(offenseGap) >= 3.0) {
            drivers.push(`${offenseGap > 0 ? teamB.team.abbreviation : teamA.team.abbreviation} brings the cleaner offensive composite into this matchup.`);
        }

        const trendDiff = Number((parseFloat(bStats.trendScore || 0) - parseFloat(aStats.trendScore || 0)).toFixed(1));
        if (Math.abs(trendDiff) >= 1) {
            drivers.push(`${trendDiff > 0 ? teamB.team.abbreviation : teamA.team.abbreviation} has the hotter team form right now.`);
        }

        const streakA = this.parseStreak(aStats.streak);
        const streakB = this.parseStreak(bStats.streak);
        if (Math.abs(streakB - streakA) >= 2) {
            drivers.push(`${streakB > streakA ? teamB.team.abbreviation : teamA.team.abbreviation} carries the better momentum angle (${streakB > streakA ? bStats.streak : aStats.streak}).`);
        }

        if (playersA.length && playersB.length) {
            const starA = playersA[0];
            const starB = playersB[0];
            const starDiff = (starB?.rating?.ratingNum || 70) - (starA?.rating?.ratingNum || 70);
            if (Math.abs(starDiff) >= 2.5) {
                const star = starDiff > 0 ? starB : starA;
                drivers.push(`Star edge goes to ${star.fullName || star.displayName} (${star.rating?.rating || '--'} OVR).`);
            }

            const hotA = playersA.slice(0, 5).reduce((sum, player) => sum + (player.rating?.hotnessScore || 0), 0);
            const hotB = playersB.slice(0, 5).reduce((sum, player) => sum + (player.rating?.hotnessScore || 0), 0);
            if (Math.abs(hotB - hotA) >= 3) {
                drivers.push(`${hotB > hotA ? teamB.team.abbreviation : teamA.team.abbreviation} has the hotter top-of-rotation form.`);
            }
        }

        if (matchup.odds?.overUnder && Math.abs(matchup.totalEdge || 0) >= 2) {
            drivers.push(`Model total sits ${Math.abs(matchup.totalEdge).toFixed(1)} points ${matchup.totalEdge > 0 ? 'over' : 'under'} the market line.`);
        }

        if (matchup.marketEdge !== null && Math.abs(matchup.marketEdge) >= 0.035) {
            drivers.push(`Moneyline gap favors the ${matchup.marketEdge > 0 ? teamB.team.abbreviation : teamA.team.abbreviation} side against the current market.`);
        }

        if (!drivers.length) {
            drivers.push('Composite edge is narrow across roster strength, efficiency, and recent form.');
        }

        return drivers.slice(0, 6);
    },

    predict(teamAId, teamBId, isHomeB = true) {
        const rankings = store.state.teamRankings;
        if (!rankings || rankings.length === 0) return null;

        const teamA = rankings.find((r) => String(r.id) === String(teamAId));
        const teamB = rankings.find((r) => String(r.id) === String(teamBId));
        if (!teamA || !teamB) return null;

        const aStats = teamA.stats;
        const bStats = teamB.stats;

        const playersA = store.state.players
            .filter((player) => String(player.teamId) === String(teamAId))
            .sort((a, b) => (b.rating?.ratingNum || 0) - (a.rating?.ratingNum || 0));
        const playersB = store.state.players
            .filter((player) => String(player.teamId) === String(teamBId))
            .sort((a, b) => (b.rating?.ratingNum || 0) - (a.rating?.ratingNum || 0));

        const rosterA = playersA.slice(0, 8);
        const rosterB = playersB.slice(0, 8);

        let edgeB = parseFloat(bStats.ovrRating || 70) - parseFloat(aStats.ovrRating || 70);
        edgeB += (parseFloat(bStats.offRating || 70) - parseFloat(aStats.defRating || 70)) * 0.24;
        edgeB -= (parseFloat(aStats.offRating || 70) - parseFloat(bStats.defRating || 70)) * 0.18;
        edgeB += (parseFloat(bStats.offensiveEfficiency || 112) - parseFloat(aStats.offensiveEfficiency || 112)) * 0.22;
        edgeB += (parseFloat(bStats.netRtg || 0) - parseFloat(aStats.netRtg || 0)) * 0.65;
        edgeB += ((parseFloat(bStats.trendScore || 0) - parseFloat(aStats.trendScore || 0)) * 1.35);
        edgeB += (this.parseStreak(bStats.streak) - this.parseStreak(aStats.streak)) * 0.8;

        if (rosterA.length && rosterB.length) {
            const rotationA = rosterA.reduce((sum, player) => sum + (player.rating?.ratingNum || 70), 0) / rosterA.length;
            const rotationB = rosterB.reduce((sum, player) => sum + (player.rating?.ratingNum || 70), 0) / rosterB.length;
            const starA = playersA.slice(0, 2).reduce((sum, player) => sum + (player.rating?.ratingNum || 70), 0) / Math.max(1, Math.min(playersA.length, 2));
            const starB = playersB.slice(0, 2).reduce((sum, player) => sum + (player.rating?.ratingNum || 70), 0) / Math.max(1, Math.min(playersB.length, 2));
            edgeB += (rotationB - rotationA) * 0.28;
            edgeB += (starB - starA) * 0.18;
        }

        if (isHomeB) edgeB += 4.5;

        const probB = 1 / (1 + Math.pow(10, -edgeB / 26));
        const probA = 1 - probB;

        const paceA = parseFloat(aStats.pace || 99);
        const paceB = parseFloat(bStats.pace || 99);
        const paceBlend = (paceA + paceB) / 2;
        const expectedA = ((parseFloat(aStats.ppg || 110) * 0.56) + (parseFloat(bStats.oppPpg || 110) * 0.44));
        const expectedB = ((parseFloat(bStats.ppg || 110) * 0.56) + (parseFloat(aStats.oppPpg || 110) * 0.44));

        const homeBonus = isHomeB ? 2.4 : 0;
        const awayBonus = !isHomeB ? 2.4 : 0;
        const trendBonusB = (parseFloat(bStats.trendScore || 0) - 2.5) * 0.8;
        const trendBonusA = (parseFloat(aStats.trendScore || 0) - 2.5) * 0.8;

        let expScoreB = Math.round(expectedB + homeBonus + (edgeB * 0.22) + trendBonusB + ((paceBlend - 99) * 0.35));
        let expScoreA = Math.round(expectedA + awayBonus - (edgeB * 0.18) + trendBonusA + ((paceBlend - 99) * 0.35));

        if (probB >= probA && expScoreB <= expScoreA) expScoreB = expScoreA + 1;
        if (probA > probB && expScoreA <= expScoreB) expScoreA = expScoreB + 1;
        if (expScoreA === expScoreB) {
            if (probB >= probA) expScoreB += 1;
            else expScoreA += 1;
        }

        const projectedMargin = Number((expScoreB - expScoreA).toFixed(1));
        const projectedTotal = expScoreA + expScoreB;
        const spreadValue = Math.max(1.0, this.roundHalf(Math.abs(projectedMargin)));
        const favoriteTeam = projectedMargin >= 0 ? teamB : teamA;
        const spreadText = `${favoriteTeam.team.displayName} -${spreadValue.toFixed(1)}`;

        let confidence = 'Medium';
        if (Math.abs(probB - 0.5) >= 0.16) confidence = 'High';
        else if (Math.abs(probB - 0.5) <= 0.07) confidence = 'Low';

        const event = this.findMatchingEvent(teamAId, teamBId);
        const odds = this.extractOdds(event);
        const homeMoneyline = odds?.homeMoneyline ?? null;
        const awayMoneyline = odds?.awayMoneyline ?? null;
        const marketHomeProbability = this.moneylineToProbability(homeMoneyline);
        const marketEdge = marketHomeProbability !== null ? (probB - marketHomeProbability) : null;
        const homeSpread = odds?.homeSpread ?? (Number.isFinite(odds?.spread) ? odds.spread : null);
        const spreadEdge = Number.isFinite(homeSpread) ? projectedMargin + Number(homeSpread) : null;
        const totalEdge = Number.isFinite(odds?.overUnder) ? projectedTotal - odds.overUnder : null;

        let bettingLean = 'Model-only projection';
        if (marketEdge !== null && Math.abs(marketEdge) >= 0.03) {
            bettingLean = `${marketEdge > 0 ? teamB.team.abbreviation : teamA.team.abbreviation} moneyline lean`;
        } else if (spreadEdge !== null && Math.abs(spreadEdge) >= 1.0) {
            bettingLean = `${spreadEdge > 0 ? teamB.team.abbreviation : teamA.team.abbreviation} spread lean`;
        } else if (totalEdge !== null && Math.abs(totalEdge) >= 2.0) {
            bettingLean = `${totalEdge > 0 ? 'Over' : 'Under'} ${odds.overUnder}`;
        }

        const matchup = {
            odds,
            totalEdge,
            marketEdge,
        };
        const drivers = this.buildDrivers(teamA, teamB, aStats, bStats, playersA, playersB, matchup);

        const timestamp = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

        return {
            teamA: {
                ...teamA,
                prob: (probA * 100).toFixed(1),
                score: expScoreA,
                moneyline: awayMoneyline,
                marketProb: this.moneylineToProbability(awayMoneyline),
            },
            teamB: {
                ...teamB,
                prob: (probB * 100).toFixed(1),
                score: expScoreB,
                moneyline: homeMoneyline,
                marketProb: marketHomeProbability,
            },
            homeWinProbability: Number((probB * 100).toFixed(1)),
            awayWinProbability: Number((probA * 100).toFixed(1)),
            spread: spreadText,
            projectedSpread: `${favoriteTeam.team.abbreviation} -${spreadValue.toFixed(1)}`,
            projectedMargin,
            projectedTotal,
            confidence,
            drivers,
            timestamp,
            eventId: event?.id || null,
            odds,
            provider: odds?.provider || null,
            homeMoneyline,
            awayMoneyline,
            marketEdge,
            spreadEdge,
            totalEdge,
            bettingLean,
            modelScoreLabel: `${teamB.team.abbreviation} ${expScoreB} - ${teamA.team.abbreviation} ${expScoreA}`,
        };
    }
};

window.predictor = predictor;
