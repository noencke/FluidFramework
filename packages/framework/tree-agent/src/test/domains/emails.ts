/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactoryAlpha } from "@fluidframework/tree/internal";
import z from "zod";

import { buildFunc, exposeMethodsSymbol, type ExposedMethods } from "../../methodBinding.js";

// A simple email schema and some sample emails for testing.

const sf = new SchemaFactoryAlpha("com.microsoft.fluid.tree-agent.email");

/**
 * An email message.
 */
export class Email extends sf.object("Email", {
	from: sf.string,
	to: sf.array(sf.string),
	subject: sf.string,
	body: sf.string,
}) {
	public get summary(): string {
		return `From: ${this.from}\nTo: ${this.to.join(", ")}\nSubject: ${
			this.subject
		}\n\n${this.body.slice(0, 100)}`;
	}
}

/**
 * An array of emails.
 */
export class Emails extends sf.array("EmailSearch", Email) {
	public static [exposeMethodsSymbol](methods: ExposedMethods): void {
		methods.expose(
			Emails,
			"load",
			buildFunc(
				{
					returns: z.promise(z.void()),
					description: "Asynchronously load emails matching the search term into this array.",
				},
				["searchTerm", z.string()],
			),
		);
	}

	public async load(searchTerm: string): Promise<void> {
		const lowerTerm = searchTerm.toLowerCase();
		const matches = emails
			.filter(
				(email) =>
					email.subject.toLowerCase().includes(lowerTerm) ||
					email.body.toLowerCase().includes(lowerTerm),
			)
			.map((email) => new Email(email));

		this.insertAtEnd(...matches);
	}
}

const emails: Email[] = [
	new Email({
		from: "alice@smellyn.com",
		to: ["bob@smellyn.com"],
		subject: "Meeting Reminder",
		body: "Don't forget about our meeting tomorrow at 10am.",
	}),
	new Email({
		from: "carol@smellyn.com",
		to: ["design-team@smellyn.com"],
		subject: "Ideation Session Notes – New Scent Concepts",
		body: "Thanks everyone. Shortlist: maple-bacon (legal risk flagged), ocean-linen remix, lavender-espresso, and citrus-rain. Please add nose fatigue ratings to the shared sheet before Friday.",
	}),
	new Email({
		from: "dave@smellyn.com",
		to: ["carol@smellyn.com", "erin@smellyn.com"],
		subject: "Re: Ideation Session Notes – New Scent Concepts",
		body: "Maple-bacon volatility curve looks good but the cured-meat facet lingers. I can try encapsulation microcaps v2 to tame it. Need procurement to approve sample spend (~$240).",
	}),
	new Email({
		from: "erin@smellyn.com",
		to: ["procurement@smellyn.com"],
		subject: "Sample Spend Approval – Encapsulation v2",
		body: "Requesting approval for $240 materials (carrier oil + microcaps) to refine bacon variant stability. Target: reduce dry-down grease note by 30%.",
	}),
	new Email({
		from: "grace@smellyn.com",
		to: ["marketing@smellyn.com", "sales@smellyn.com"],
		subject: "Tentative Launch Name: 'Breakfast Crisp Bacon'",
		body: "Working title polling at 62% favorability internally. Concerns: trademark overlap + possible dietary lifestyle backlash. Collect alt names by EOD (theme: comfort morning).",
	}),
	new Email({
		from: "heidi@smellyn.com",
		to: ["grace@smellyn.com"],
		subject: "Alt Name Ideas",
		body: "Submissions: 'Morning Sizzle', 'Smoky Sunrise', 'Cozy Skillet', 'Campfire Brunch'. Personally like 'Smoky Sunrise' – less literal bacon risk.",
	}),
	new Email({
		from: "frank@smellyn.com",
		to: ["legal@smellyn.com", "grace@smellyn.com"],
		subject: "Pre-clearance Request – Bacon Related Marks",
		body: "Could you run a quick clearance scan on the phrases: Breakfast Crisp Bacon, Morning Sizzle, Smoky Sunrise? Need risk ratings before graphics lock Tuesday.",
	}),
	new Email({
		from: "legal@smellyn.com",
		to: ["leadership@smellyn.com", "marketing@smellyn.com"],
		subject: "URGENT: Cease & Desist Received (Bacon Descriptor)",
		body: "We received a C&D alleging our draft packaging infringes on 'CrispBacon Breeze' mark in household laundry category. Recommending immediate pause on external teasers using 'bacon' until assessment complete.",
	}),
	new Email({
		from: "alice@smellyn.com",
		to: ["all@smellyn.com"],
		subject: "Temporary Hold on Bacon Launch Assets",
		body: "Per legal guidance we're freezing outbound creative referencing bacon until clearance. Continue internal R&D (olfactory) work; do not post or share mockups externally.",
	}),
	new Email({
		from: "legal@smellyn.com",
		to: ["dave@smellyn.com", "carol@smellyn.com"],
		subject: "Scope of Hold (Formula Work Allowed)",
		body: "Hold only covers marketing use of contested terminology. Continue chemistry evaluation. Avoid saving files with 'Bacon' in public repo branches – use code name 'Project Sunrise'.",
	}),
	new Email({
		from: "grace@smellyn.com",
		to: ["marketing@smellyn.com"],
		subject: "Pivot Plan Draft – If 'Bacon' Off Limits",
		body: "If prohibition sticks, pivot narrative to 'Savory Comfort Morning'. Need revised tagline proposals (<= 35 chars) by tomorrow standup.",
	}),
	new Email({
		from: "office-manager@smellyn.com",
		to: ["all@smellyn.com"],
		subject: "Friendly Reminder: Shared Fridge Etiquette",
		body: "Label personal items. Unlabeled milk last week disappeared twice. Please be considerate – replacement costs add up for folks.",
	}),
	new Email({
		from: "sam@smellyn.com",
		to: ["office-manager@smellyn.com"],
		subject: "Re: Shared Fridge Etiquette",
		body: "Noticed security cam near break room is offline (blinking red). Might impede resolving the milk issue. Logging just in case.",
	}),
	new Email({
		from: "hr@smellyn.com",
		to: ["leadership@smellyn.com"],
		subject: "Investigation Summary – Repeated Milk Removal",
		body: "Footage (restored) shows intern (ID: IN-24-07 'Liam') taking labeled oat milk multiple days. Witness statement corroborates. Recommending termination per handbook section 4.2 (respecting personal property).",
	}),
	new Email({
		from: "hr@smellyn.com",
		to: ["liam.intern@smellyn.com"],
		subject: "Termination Meeting Invite (Confidential)",
		body: "Please meet HR + supervisor at 3:00 PM today in Conference A regarding a policy matter. Bring badge and company laptop.",
	}),
	new Email({
		from: "hr@smellyn.com",
		to: ["all@smellyn.com"],
		subject: "Staff Update",
		body: "Intern Liam has departed the company effective today. Please route any outstanding tasks tied to his project board to Carol. Reminder: respect for shared and personal items is critical to our culture.",
	}),
	new Email({
		from: "alice@smellyn.com",
		to: ["all@smellyn.com"],
		subject: "Announcing Our New COO",
		body: "Excited to share that Rachel joins us as COO next Monday. She scaled operations at a 30-person sustainable textiles startup. She will lead supply chain, fulfillment, and workplace improvements.",
	}),
	new Email({
		from: "rachel@smellyn.com",
		to: ["all@smellyn.com"],
		subject: "Hello Aroma Team!",
		body: "Thrilled to be aboard. First 30 days: listen, map bottlenecks (especially in scent QA queue), and stabilize pre-launch processes for Project Sunrise. My door (and Slack) are open.",
	}),
	new Email({
		from: "carol@smellyn.com",
		to: ["qa@smellyn.com", "dave@smellyn.com"],
		subject: "QA Panel Results – Smoky Prototype v4",
		body: "Panel (n=7) found improved top note authenticity, but after 20 minutes fabric retains faint fryer aroma (2 votes 'distracting'). Need oxidation curve data to confirm if packaging barrier is culprit.",
	}),
	new Email({
		from: "qa@smellyn.com",
		to: ["carol@smellyn.com", "dave@smellyn.com"],
		subject: "Oxidation Curve Data Attached",
		body: "Uploaded to lab drive. v4 shows peroxide value spike at 8h ambient exposure. Suggest nitrogen flush test (cost minimal) before we blame barrier film.",
	}),
	new Email({
		from: "dave@smellyn.com",
		to: ["procurement@smellyn.com"],
		subject: "Nitrogen Flush Trial Materials",
		body: "Need disposable canisters (3) + regulator adapter. If approved by noon I can run trials and have results for Rachel's ops review Monday.",
	}),
	new Email({
		from: "grace@smellyn.com",
		to: ["design@smellyn.com"],
		subject: "Hold Variant Layer – Remove Bacon Icon",
		body: "Please strip sizzling pan glyph from homepage hero mock. Replace with abstract warm gradient until naming settles.",
	}),
	new Email({
		from: "design@smellyn.com",
		to: ["grace@smellyn.com"],
		subject: "Re: Hold Variant Layer – Asset Update",
		body: "Updated hero pushed to figma frame 'Landing v6 – Neutral'. Also exported fallback PNG for dev. Alt text placeholder 'Savory Comfort Limited'.",
	}),
	new Email({
		from: "frank@smellyn.com",
		to: ["grace@smellyn.com", "alice@smellyn.com"],
		subject: "Legal Risk Matrix – Revised Names",
		body: "Risk ratings: 'Smoky Sunrise' (Low), 'Morning Sizzle' (Medium – descriptive), 'Cozy Skillet' (Medium/High – skillet mark in cookware class). Recommend proceeding with clearance filing for 'Smoky Sunrise'.",
	}),
	new Email({
		from: "alice@smellyn.com",
		to: ["marketing@smellyn.com"],
		subject: "Decision: Adopt 'Smoky Sunrise' Working Name",
		body: "Barring objection by 4 PM we'll align all docs + code name to 'Smoky Sunrise' (Project Sunrise internal). Update decks, packaging drafts, and social calendars accordingly.",
	}),
	new Email({
		from: "rachel@smellyn.com",
		to: ["operations@smellyn.com"],
		subject: "Throughput Audit – Dryer Sheet Substrate",
		body: "Line 2 downtime last week: 11%. Main causes: film roll changeovers (6%), QA hold (3%), sensor misalignment (2%). Please propose countermeasures with estimated ROI before Friday standup.",
	}),
	new Email({
		from: "operations@smellyn.com",
		to: ["rachel@smellyn.com"],
		subject: "Re: Throughput Audit – Countermeasure Draft",
		body: "Suggestions: pre-stage roll cores (cuts 2%), add inline moisture probe (reduces QA rechecks), preventive calibration script for sensor (pilot Tuesday). Need capex approval ($1.2k).",
	}),
	new Email({
		from: "finance@smellyn.com",
		to: ["alice@smellyn.com", "rachel@smellyn.com"],
		subject: "Q3 Forecast Impact – Bacon Launch Delay",
		body: "Assuming four-week slip, projected revenue impact = -$42K, partially offset by lowered ad spend (-$9K). Cash runway unchanged (11.2 months).",
	}),
	new Email({
		from: "ivan@smellyn.com",
		to: ["engineering@smellyn.com"],
		subject: "Build Script Patch – Scent Variant Flag",
		body: "Added SCENT_VARIANT environment flag so QA can toggle volatile compound logging without rebuilding. Ping if pipeline caches misbehave.",
	}),
	new Email({
		from: "mia@smellyn.com",
		to: ["ivan@smellyn.com"],
		subject: "Re: Build Script Patch – Works",
		body: "Confirmed on Windows runner. Log file now includes headspace ppm deltas. This should help Dave correlate microcaps performance.",
	}),
	new Email({
		from: "office-manager@smellyn.com",
		to: ["all@smellyn.com"],
		subject: "Kitchen Update – Fresh Milk Labeling System",
		body: "Installed color-coded clips. Please match your name tag to clip color. Unlabeled milk moved to 'communal' shelf Fridays.",
	}),
	new Email({
		from: "tina@smellyn.com",
		to: ["all@smellyn.com"],
		subject: "Friday Smell Panel Volunteers Needed",
		body: "Need 5 not already habituated to savory notes (if you've sniffed >3 bacon prototypes this week, please sit out). Sign up in the doc.",
	}),
	new Email({
		from: "sam@smellyn.com",
		to: ["tina@smellyn.com"],
		subject: "Panel Sign Up",
		body: "I have only sniffed two prototypes. Happy to join if still a slot. Also can log descriptions quickly if we use the new form.",
	}),
	new Email({
		from: "ursula@smellyn.com",
		to: ["all@smellyn.com"],
		subject: "Wellness Minute – Olfactory Fatigue Tips",
		body: "Rotate out after 10 consecutive scent evaluations, hydrate, and sniff neutral wool to reset. Avoid coffee beans (masking effect).",
	}),
	new Email({
		from: "frank@smellyn.com",
		to: ["alice@smellyn.com", "grace@smellyn.com"],
		subject: "Draft Holding Statement – Trademark Inquiry",
		body: "Prepared neutral statement: 'We're refining our upcoming savory-inspired release to ensure distinct positioning and compliance.' Feedback welcome. Avoid saying 'bacon' explicitly until clearance.",
	}),
	new Email({
		from: "grace@smellyn.com",
		to: ["frank@smellyn.com"],
		subject: "Re: Holding Statement Edits",
		body: "Tweaked tone to add consumer anticipation: 'We can't wait to share more soon.' Ready for approval.",
	}),
	new Email({
		from: "legal@smellyn.com",
		to: ["leadership@smellyn.com"],
		subject: "Trademark Negotiation Update",
		body: "Counterparty open to coexistence if we avoid 'Crisp' + 'Breeze' adjacency. 'Smoky Sunrise' unaffected. Expect written draft early next week.",
	}),
	new Email({
		from: "alice@smellyn.com",
		to: ["all@smellyn.com"],
		subject: "Progress – Savory Variant Naming",
		body: "We've selected 'Smoky Sunrise' pending final filing. Thanks for adaptability. Marketing may reintroduce teaser schedule (rev 2) shortly.",
	}),
	new Email({
		from: "rachel@smellyn.com",
		to: ["operations@smellyn.com", "qa@smellyn.com", "marketing@smellyn.com"],
		subject: "Go/No-Go Checklist Draft – 'Smoky Sunrise'",
		body: "Checklist includes: stability (microcaps v2) pass, nitrogen flush validation, packaging print proof sign-off, risk letter countersigned, landing hero updated. Please mark system owner beside each by tomorrow.",
	}),
	new Email({
		from: "qa@smellyn.com",
		to: ["rachel@smellyn.com"],
		subject: "Re: Go/No-Go – Stability Pass Logged",
		body: "Logged 30-day accelerated test equivalence. Grease note reduction hit 34% (target 30%). Attaching assay PDF in drive.",
	}),
	new Email({
		from: "grace@smellyn.com",
		to: ["alice@smellyn.com", "frank@smellyn.com"],
		subject: "Teaser Schedule Rev 2 Ready",
		body: "Three-phase roll-out: (1) 'Savory Comfort Coming' neutral gradient, (2) silhouette of sunrise icon, (3) name reveal post-legal clearance doc receipt. Assets queued.",
	}),
	new Email({
		from: "alice@smellyn.com",
		to: ["all@smellyn.com"],
		subject: "Appreciation Note",
		body: "Proud of how the team navigated the naming turbulence + unexpected fridge drama. Let's land 'Smoky Sunrise' smoothly and then celebrate with a brunch (milk provided).",
	}),
];
