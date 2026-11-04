import re

from CTFd.plugins import register_plugin_assets_directory


class FlagException(Exception):
    def __init__(self, message):
        self.message = message

    def __str__(self):
        return self.message


class BaseFlag(object):
    name = None
    templates = {}

    @staticmethod
    def compare(self, saved, provided):
        return True


class CTFdStaticFlag(BaseFlag):
    name = "static"
    templates = {  # Nunjucks templates used for key editing & viewing
        "create": "/plugins/flags/assets/static/create.html",
        "update": "/plugins/flags/assets/static/edit.html",
    }

    @staticmethod
    def compare(chal_key_obj, provided):
        saved = chal_key_obj.content
        data = chal_key_obj.data

        if len(saved) != len(provided):
            return False
        result = 0

        if data == "case_insensitive":
            for x, y in zip(saved.lower(), provided.lower()):
                result |= ord(x) ^ ord(y)
        else:
            for x, y in zip(saved, provided):
                result |= ord(x) ^ ord(y)
        return result == 0


class CTFdRegexFlag(BaseFlag):
    name = "regex"
    templates = {  # Nunjucks templates used for key editing & viewing
        "create": "/plugins/flags/assets/regex/create.html",
        "update": "/plugins/flags/assets/regex/edit.html",
    }

    @staticmethod
    def compare(chal_key_obj, provided):
        saved = chal_key_obj.content
        data = chal_key_obj.data

        try:
            if data == "case_insensitive":
                res = re.match(saved, provided, re.IGNORECASE)
            else:
                res = re.match(saved, provided)
        # TODO: this needs plugin improvements. See #1425.
        except re.error as e:
            raise FlagException("Regex parse error occured") from e

        return res and res.group() == provided


class WorkshopChoiceFlag(BaseFlag):
    """Multiple-choice answer.

    The flag content holds the accepted choice(s). Several accepted answers can
    be separated by "|". Comparison is case-insensitive and whitespace-tolerant
    so that the value submitted by the radio/checkbox UI always matches.
    """

    name = "choice"
    templates = {
        "create": "/plugins/flags/assets/choice/create.html",
        "update": "/plugins/flags/assets/choice/edit.html",
    }

    @staticmethod
    def compare(chal_key_obj, provided):
        saved = chal_key_obj.content or ""
        accepted = [c.strip().lower() for c in saved.split("|") if c.strip()]

        # Multi-select answers arrive comma separated; compare as a set so the
        # order the student clicked the options in does not matter.
        given = [c.strip().lower() for c in (provided or "").split(",") if c.strip()]

        if not accepted or not given:
            return False

        if len(accepted) > 1 and chal_key_obj.data == "multiple":
            return set(given) == set(accepted)

        return len(given) == 1 and given[0] in accepted


class WorkshopManualFlag(BaseFlag):
    """An answer that an administrator must approve.

    Nothing is compared automatically: any non-empty submission is accepted
    into the review queue. The API turns this into a "pending" submission
    rather than a solve, and points are awarded once an admin approves it.
    """

    name = "manual"
    templates = {
        "create": "/plugins/flags/assets/manual/create.html",
        "update": "/plugins/flags/assets/manual/edit.html",
    }
    # Marks this flag type as requiring review. Read by the challenges API.
    requires_review = True

    @staticmethod
    def compare(chal_key_obj, provided):
        # A non-empty answer is enough to be queued for review.
        return bool((provided or "").strip())


FLAG_CLASSES = {
    "static": CTFdStaticFlag,
    "regex": CTFdRegexFlag,
    "choice": WorkshopChoiceFlag,
    "manual": WorkshopManualFlag,
}


def challenge_requires_review(challenge_id):
    """True when a challenge has at least one flag needing manual approval."""
    from CTFd.models import Flags

    flags = Flags.query.filter_by(challenge_id=challenge_id).all()
    for flag in flags:
        cls = FLAG_CLASSES.get(flag.type)
        if cls is not None and getattr(cls, "requires_review", False):
            return True
    return False


def get_flag_class(class_id):
    cls = FLAG_CLASSES.get(class_id)
    if cls is None:
        raise KeyError
    return cls


def load(app):
    register_plugin_assets_directory(app, base_path="/plugins/flags/assets/")
