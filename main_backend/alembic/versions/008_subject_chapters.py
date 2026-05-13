"""Create and seed subject chapters

Revision ID: 008
Revises: 007
Create Date: 2026-05-13
"""

from __future__ import annotations

import json

from alembic import op
import sqlalchemy as sa

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


SUBJECTS = {
    "compulsory_math": {
        "chapters": [
            {
                "id": "arithmetic",
                "display_name": "Arithmetic",
                "topics": [
                    {"id": "ratio_proportion", "display_name": "Ratio and Proportion", "subtopics": ["ratio", "proportion", "continued proportion", "partnership"]},
                    {"id": "percentage", "display_name": "Percentage", "subtopics": ["percentage", "profit and loss", "discount", "commission"]},
                    {"id": "tax_vat", "display_name": "Tax and VAT", "subtopics": ["income tax", "value added tax", "calculation with VAT"]},
                    {"id": "compound_interest", "display_name": "Compound Interest", "subtopics": ["simple interest", "compound interest", "population growth", "depreciation"]},
                ],
            },
            {
                "id": "algebra",
                "display_name": "Algebra",
                "topics": [
                    {"id": "polynomials", "display_name": "Polynomials", "subtopics": ["algebraic expressions", "factorisation", "HCF", "LCM"]},
                    {"id": "linear_equations", "display_name": "Linear Equations", "subtopics": ["linear equations in one variable", "simultaneous linear equations", "word problems"]},
                    {"id": "quadratic_equations", "display_name": "Quadratic Equations", "subtopics": ["standard form", "factorisation method", "quadratic formula", "discriminant"]},
                    {"id": "indices_surds", "display_name": "Indices and Surds", "subtopics": ["laws of indices", "surds", "rationalisation"]},
                ],
            },
            {
                "id": "geometry",
                "display_name": "Geometry",
                "topics": [
                    {"id": "triangles", "display_name": "Triangles", "subtopics": ["congruence of triangles", "similarity of triangles", "Pythagoras theorem", "midpoint theorem"]},
                    {"id": "circles", "display_name": "Circles", "subtopics": ["circle theorems", "tangent to a circle", "chord properties", "arc and sector"]},
                    {"id": "areas_volume", "display_name": "Areas and Volume", "subtopics": ["area of polygons", "surface area of prism", "surface area of cylinder", "volume of prism", "volume of cylinder", "sphere and hemisphere"]},
                ],
            },
            {
                "id": "trigonometry",
                "display_name": "Trigonometry",
                "topics": [
                    {"id": "trig_ratios", "display_name": "Trigonometric Ratios", "subtopics": ["sin cos tan", "complementary angles", "standard angles (30 45 60 90)"]},
                    {"id": "trig_identities", "display_name": "Trigonometric Identities", "subtopics": ["Pythagorean identities", "reciprocal identities", "proof of identities"]},
                    {"id": "heights_distances", "display_name": "Heights and Distances", "subtopics": ["angle of elevation", "angle of depression", "word problems"]},
                ],
            },
            {
                "id": "statistics",
                "display_name": "Statistics",
                "topics": [
                    {"id": "measures_central_tendency", "display_name": "Measures of Central Tendency", "subtopics": ["mean", "median", "mode", "frequency distribution", "cumulative frequency"]},
                    {"id": "measures_dispersion", "display_name": "Measures of Dispersion", "subtopics": ["range", "quartile deviation", "mean deviation", "standard deviation"]},
                ],
            },
            {
                "id": "probability",
                "display_name": "Probability",
                "topics": [
                    {"id": "basic_probability", "display_name": "Basic Probability", "subtopics": ["sample space", "events", "probability formula", "mutually exclusive events", "equally likely events"]},
                ],
            },
        ],
    },
    "optional_math": {
        "chapters": [
            {"id": "coordinate_geometry", "display_name": "Coordinate Geometry", "topics": [
                {"id": "straight_line", "display_name": "Straight Line", "subtopics": ["slope of a line", "equations of a line", "parallel and perpendicular lines", "distance between lines"]},
                {"id": "circle_coordinate", "display_name": "Circle (Coordinate)", "subtopics": ["standard equation of circle", "general equation", "centre and radius", "tangent to circle"]},
                {"id": "conic_sections", "display_name": "Conic Sections", "subtopics": ["parabola", "ellipse basics"]},
            ]},
            {"id": "trigonometry_advanced", "display_name": "Trigonometry", "topics": [
                {"id": "compound_angles", "display_name": "Compound Angles", "subtopics": ["addition and subtraction formulas", "double angle formulas", "half angle formulas"]},
                {"id": "trig_equations", "display_name": "Trigonometric Equations", "subtopics": ["general solution", "specific angle solutions"]},
            ]},
            {"id": "vectors", "display_name": "Vectors", "topics": [
                {"id": "vector_basics", "display_name": "Vector Basics", "subtopics": ["types of vectors", "addition and subtraction", "scalar multiplication", "position vectors"]},
                {"id": "dot_product", "display_name": "Dot Product", "subtopics": ["definition", "properties", "angle between vectors", "projection"]},
            ]},
            {"id": "matrices", "display_name": "Matrices and Determinants", "topics": [
                {"id": "matrix_operations", "display_name": "Matrix Operations", "subtopics": ["types of matrices", "addition and subtraction", "multiplication", "transpose"]},
                {"id": "determinants", "display_name": "Determinants", "subtopics": ["determinant of 2x2 and 3x3 matrix", "properties", "Cramer's rule"]},
                {"id": "inverse_matrix", "display_name": "Inverse of a Matrix", "subtopics": ["adjoint method", "solving linear equations using matrices"]},
            ]},
            {"id": "calculus", "display_name": "Calculus", "topics": [
                {"id": "limits", "display_name": "Limits and Continuity", "subtopics": ["concept of limit", "rules of limits", "continuity of a function"]},
                {"id": "differentiation", "display_name": "Differentiation", "subtopics": ["first principles", "rules (sum product quotient chain)", "derivative of standard functions", "application to tangent and normal"]},
                {"id": "integration", "display_name": "Integration", "subtopics": ["indefinite integration", "standard formulas", "definite integral"]},
            ]},
            {"id": "probability_advanced", "display_name": "Probability", "topics": [
                {"id": "probability_theorems", "display_name": "Probability Theorems", "subtopics": ["addition theorem", "multiplication theorem", "conditional probability", "independent events"]},
            ]},
        ],
    },
    "compulsory_english": {
        "chapters": [
            {"id": "reading_comprehension", "display_name": "Reading Comprehension", "topics": [
                {"id": "unseen_passage", "display_name": "Unseen Passage", "subtopics": ["identifying main idea", "inferring meaning", "factual questions", "vocabulary in context"]},
                {"id": "note_making", "display_name": "Note Making and Summarising", "subtopics": ["identifying key points", "summarising a passage"]},
            ]},
            {"id": "grammar", "display_name": "Grammar", "topics": [
                {"id": "parts_of_speech", "display_name": "Parts of Speech", "subtopics": ["nouns", "pronouns", "adjectives", "adverbs", "verbs", "prepositions", "conjunctions", "interjections"]},
                {"id": "tenses", "display_name": "Tenses", "subtopics": ["simple present", "present continuous", "present perfect", "simple past", "past continuous", "past perfect", "future tenses"]},
                {"id": "voice", "display_name": "Active and Passive Voice", "subtopics": ["rules for changing voice", "passive across tenses"]},
                {"id": "narration", "display_name": "Direct and Indirect Narration", "subtopics": ["rules for reporting speech", "statements", "questions", "commands"]},
                {"id": "clauses", "display_name": "Clauses and Sentences", "subtopics": ["types of clauses", "simple compound complex sentences", "conditional sentences"]},
                {"id": "correction", "display_name": "Error Correction", "subtopics": ["subject-verb agreement", "article usage", "preposition errors", "tense errors"]},
            ]},
            {"id": "vocabulary", "display_name": "Vocabulary", "topics": [
                {"id": "synonyms_antonyms", "display_name": "Synonyms and Antonyms", "subtopics": ["common synonyms", "common antonyms"]},
                {"id": "word_forms", "display_name": "Word Forms", "subtopics": ["prefixes and suffixes", "noun verb adjective adverb forms"]},
                {"id": "idioms_phrases", "display_name": "Idioms and Phrases", "subtopics": ["common idioms", "phrasal verbs"]},
            ]},
            {"id": "writing", "display_name": "Writing Skills", "topics": [
                {"id": "essays", "display_name": "Essays", "subtopics": ["narrative essay", "descriptive essay", "argumentative essay", "essay structure"]},
                {"id": "letters", "display_name": "Letter Writing", "subtopics": ["formal letter", "informal letter", "application letter"]},
                {"id": "reports_notices", "display_name": "Reports and Notices", "subtopics": ["news report", "notice writing", "paragraph writing"]},
            ]},
        ],
    },
    "compulsory_science": {
        "chapters": [
            {"id": "physics_motion", "display_name": "Physics: Motion and Force", "topics": [
                {"id": "kinematics", "display_name": "Kinematics", "subtopics": ["distance and displacement", "speed and velocity", "acceleration", "equations of motion", "graphs of motion"]},
                {"id": "newtons_laws", "display_name": "Newton's Laws of Motion", "subtopics": ["first law inertia", "second law F=ma", "third law action-reaction", "friction"]},
                {"id": "gravity", "display_name": "Gravitation", "subtopics": ["Newton's law of gravitation", "g value", "weight vs mass", "free fall"]},
            ]},
            {"id": "physics_energy", "display_name": "Physics: Work, Energy and Power", "topics": [
                {"id": "work_energy", "display_name": "Work and Energy", "subtopics": ["work done", "kinetic energy", "potential energy", "conservation of energy"]},
                {"id": "power_machines", "display_name": "Power and Machines", "subtopics": ["power", "simple machines", "mechanical advantage", "efficiency"]},
            ]},
            {"id": "physics_light", "display_name": "Physics: Light", "topics": [
                {"id": "reflection", "display_name": "Reflection", "subtopics": ["laws of reflection", "plane mirror", "curved mirrors", "image formation"]},
                {"id": "refraction", "display_name": "Refraction", "subtopics": ["laws of refraction", "Snell's law", "total internal reflection", "lenses", "dispersion"]},
            ]},
            {"id": "physics_electricity", "display_name": "Physics: Electricity and Magnetism", "topics": [
                {"id": "current_electricity", "display_name": "Current Electricity", "subtopics": ["current voltage resistance", "Ohm's law", "series and parallel circuits", "electrical power and energy"]},
                {"id": "magnetism", "display_name": "Magnetism", "subtopics": ["magnetic field", "electromagnet", "electromagnetic induction"]},
            ]},
            {"id": "chemistry_matter", "display_name": "Chemistry: Matter and Its Properties", "topics": [
                {"id": "atomic_structure", "display_name": "Atomic Structure", "subtopics": ["atom structure", "protons neutrons electrons", "atomic number and mass number", "isotopes"]},
                {"id": "periodic_table", "display_name": "Periodic Table", "subtopics": ["groups and periods", "trends in periodic table", "valency", "electronic configuration"]},
            ]},
            {"id": "chemistry_reactions", "display_name": "Chemistry: Chemical Reactions", "topics": [
                {"id": "chemical_equations", "display_name": "Chemical Equations", "subtopics": ["writing and balancing equations", "types of reactions"]},
                {"id": "acids_bases", "display_name": "Acids, Bases and Salts", "subtopics": ["properties of acids", "properties of bases", "pH scale", "neutralisation", "salts"]},
                {"id": "metals_nonmetals", "display_name": "Metals and Non-Metals", "subtopics": ["properties of metals", "properties of non-metals", "reactivity series", "corrosion"]},
                {"id": "carbon_compounds", "display_name": "Carbon Compounds", "subtopics": ["hydrocarbons", "organic compounds basics", "alcohols and carboxylic acids"]},
            ]},
            {"id": "biology_life_processes", "display_name": "Biology: Life Processes", "topics": [
                {"id": "cell_biology", "display_name": "Cell Biology", "subtopics": ["cell structure", "plant vs animal cell", "cell division mitosis meiosis"]},
                {"id": "nutrition_digestion", "display_name": "Nutrition and Digestion", "subtopics": ["types of nutrition", "human digestive system", "photosynthesis", "respiration"]},
                {"id": "circulation_excretion", "display_name": "Circulation and Excretion", "subtopics": ["human circulatory system", "heart structure", "blood components", "excretion in humans", "kidney structure"]},
                {"id": "nervous_system", "display_name": "Nervous System and Coordination", "subtopics": ["neuron structure", "central and peripheral nervous system", "reflex action", "endocrine system basics"]},
            ]},
            {"id": "biology_heredity", "display_name": "Biology: Heredity and Evolution", "topics": [
                {"id": "genetics", "display_name": "Genetics and Heredity", "subtopics": ["Mendelian genetics", "dominant and recessive traits", "Punnett square", "sex determination"]},
                {"id": "evolution", "display_name": "Evolution", "subtopics": ["Darwin's theory", "natural selection", "adaptation", "human evolution"]},
            ]},
            {"id": "biology_environment", "display_name": "Biology: Environment and Ecology", "topics": [
                {"id": "ecosystem", "display_name": "Ecosystem", "subtopics": ["food chain and food web", "trophic levels", "energy flow", "biogeochemical cycles"]},
                {"id": "environment_issues", "display_name": "Environmental Issues", "subtopics": ["pollution types", "global warming", "ozone layer", "conservation"]},
            ]},
        ],
    },
}


def _normalize_topics(topics: list[dict]) -> list[dict]:
    normalized = []
    for topic in topics:
        topic_key = topic.get("topic") or topic.get("id")
        normalized.append({
            "topic": topic_key,
            "subtopics": topic.get("subtopics") or [],
        })
    return normalized


def upgrade() -> None:
    op.execute("""
        CREATE TABLE subject_chapters (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            subject VARCHAR(100) NOT NULL,
            chapter_id VARCHAR(255) NOT NULL,
            display_name VARCHAR(500) NOT NULL,
            topics JSONB NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_subject_chapter UNIQUE (subject, chapter_id)
        )
    """)
    op.execute("CREATE INDEX ix_subject_chapters_subject ON subject_chapters (subject)")

    conn = op.get_bind()
    for subject, data in SUBJECTS.items():
        for index, chapter in enumerate(data["chapters"], start=1):
            conn.execute(
                sa.text("""
                INSERT INTO subject_chapters (subject, chapter_id, display_name, topics, sort_order)
                VALUES (:subject, :chapter_id, :display_name, CAST(:topics AS JSONB), :sort_order)
                ON CONFLICT (subject, chapter_id) DO NOTHING
                """),
                {
                    "subject": subject,
                    "chapter_id": chapter["id"],
                    "display_name": chapter["display_name"],
                    "topics": json.dumps(_normalize_topics(chapter["topics"])),
                    "sort_order": index,
                },
            )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS subject_chapters")
