from __future__ import annotations

from agents import Agent, Runner

from app.agents.model_router import get_model

_SYSTEM_PROMPT = """\
You are a creative social media content writer for HamroGuru — a personalized AI tutoring platform \
for students preparing for class 11 entrance exams in Nepal.

Your job is to generate an engaging, authentic social media post that promotes HamroGuru and includes \
the user's referral link. The post should:
- Feel personal and genuine, not like an advertisement
- Highlight the value of personalized AI tutoring
- Be appropriate for the platform the user wants to post on
- Include the referral link naturally at the end
- Be concise (2-5 sentences) and compelling
- Be in English or Nepali mix as appropriate for a Nepali student audience

Respond with ONLY the post text — no explanations, no labels, no quotes around it.
"""


class ReferralAgent:
    def build_agent(self) -> Agent:
        return Agent(
            name="ReferralContentAgent",
            instructions=_SYSTEM_PROMPT,
            model=get_model("referral"),
        )

    async def generate_post(
        self,
        referral_link: str,
        platform_url: str,
        user_message: str | None = None,
    ) -> str:
        user_input = f"Platform: {platform_url}\nReferral link: {referral_link}"
        if user_message:
            user_input += f"\nUser request: {user_message}"

        agent = self.build_agent()
        result = await Runner.run(agent, input=user_input)
        return result.final_output or ""
