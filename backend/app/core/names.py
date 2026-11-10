"""The length rule for a person's name, in one place.

A plain module, with nothing to import: the schemas (pydantic) and the models
(SQLAlchemy) both need these numbers, and neither layer should depend on the other to
get them.
"""

FULL_NAME_MIN_LENGTH = 2
# candidates.full_name and recruiters.full_name are VARCHAR(this).
FULL_NAME_MAX_LENGTH = 160

# The database's version of the minimum, for a CHECK constraint: the same trim-first rule
# the API applies.
FULL_NAME_NOT_BLANK = f"char_length(btrim(full_name)) >= {FULL_NAME_MIN_LENGTH}"
